"""The Velvet Ring: builds client/public/models/boxing_ring.glb (the hall) and boxing_gloves.glb (the
fighters' gloves).

Run it inside Blender like build_casino.py (through the Live Bridge, in a namespace of its own with
REPO_ROOT and REPORT_PATH set, or headless: blender -b -P scripts/blender/build_boxing_ring.py). It
borrows the Velvet Casino builder's kit (its palette, its finishes, its meshes and its furniture:
everything in build_casino.py above its `build`), so the hall is painted and finished like the
casino: every colour a vertex colour over a handful of shared materials, a draw call per finish.

Nothing is placed by hand: where everything stands comes from RING_LAYOUT in
shared/worlds/boxing_ring.ts (the JSON between its layout markers, read as it is), and every seat's
height from its cushion in shared/seats.ts (bleacher, gymBench, chesterfield, barStool, dining): the
numbers the colliders, the fighters' bounds and the seat anchors are derived from.

    BoxingRing_Static   everything that stands still, merged into ONE object:
                          the 20x20 slab; aged honey herringbone parquet round the ring and in the
                          gym, black-and-white checkerboard tiles in the lounge and the pro shop,
                          brass strips where they meet; the two back walls (an oak wainscot to 1.15
                          under warm red brick in running bond, an iron beam along the top), tall
                          steel sash windows onto a starry night (a crescent moon in one), oak piers
                          with burgundy velvet drapes gathered to them by gold tiebacks, the yellow
                          neon "THE VELVET RING" on its raceway over the lockers (its glow on the
                          brick), two old fight posters; the ring: its apron in burgundy velvet with
                          the hall's name in gold, the cream canvas with a faded gold star, the four
                          padded posts (Red, Blue, two neutral) and their turnbuckles, the corner
                          steps, stools, water buckets and chalk basins; the industrial dome lamp on
                          its chain over it; the timekeeper's table with its brass bell and the
                          judges' chairs, the ringside folding chairs; the lounge's three tiers of
                          benches, two tufted Chesterfields, cocktail tables and stools, the
                          chalkboard's easel; the gym's lockers (two doors open), the bench and its
                          towels, the balance-beam scale, the heavy bag's wall bracket, the speed
                          bag's platform; Coach Bruno's pro shop (the oak counter, the duckboard
                          behind it, the back bar of gloves, tape and bottles, the cash register, the
                          sign) and the trophy case, the Velvet Championship Belt on its stand under
                          the downlights; the brass rail along the open front
    Prop_Ropes_n/s/e/w  each side's three ropes (origin at the ring's middle, on the canvas): the
                        game bends them when a fighter is driven into them
    Prop_HeavyBag       the heavy bag and its chain (origin where the chain hangs from the bracket:
                        the game swings it)
    Prop_SpeedBag       the speed bag (origin at its swivel: the game rattles it)
    Prop_ChalkSlate     the chalkboard's slate: a quad with UVs the game chalks the bout on

    boxing_gloves.glb   Glove_red_L / _R, Glove_blue_L / _R and Glove_tiger_L / _R: a boxing glove
                        each (the Classic Gloves in the Red and the Blue Corner's colours, the Tiger
                        Stripe Mitts), its origin at the hand (the game hangs it on the avatar's
                        ArmL / ArmR where the hand is), knuckles down the arm

Some light is painted in (bake_light): the dome lamp's warm pool on the canvas and round the ring,
the neon's yellow glow on the brick, the trophy case's downlight; no textures.

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y), as in the casino's builder.
"""

import json
import math
import os
import re
import traceback

import bmesh
import bpy
from mathutils import Vector


def _root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_boxing_ring.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# the casino's kit: everything in build_casino.py above its build()
_hall = open(os.path.join(_root(), "scripts", "blender", "build_casino.py"), encoding="utf-8").read()
exec(compile(_hall[: _hall.index("def build(root):")], "build_casino.py", "exec"), globals())

COLLECTION = "BoxingRing"
GLOVES = "BoxingGloves"
REPO_ROOT = _root()

PALETTE.update(
    {
        # the gym's mirrors
        "BX_Mirror": "#A7B9C1",
        "BX_MirrorLight": "#DDE9EC",
        "BX_MirrorDark": "#7C8F98",
        # floors
        "BX_Parquet": "#8C5C34",
        "BX_ParquetDark": "#80522D",
        "BX_ParquetLight": "#98653A",
        "BX_TileWhite": "#E9E2D2",
        "BX_TileBlack": "#1C1719",
        # walls
        "BX_Mortar": "#B9A58A",
        "BX_Brick": "#8E3B2A",
        "BX_BrickDark": "#733022",
        "BX_BrickLight": "#A24A33",
        "BX_Oak": "#7A4E2A",
        "BX_OakDark": "#5A3719",
        "BX_Steel": "#4A4E55",
        "BX_SteelDark": "#2A2D32",
        # the night through the windows (unlit)
        "BX_SkyTop": "#0A0E2A",
        "BX_SkyMid": "#172049",
        "BX_SkyLow": "#2E2A5E",
        "BX_Star": "#FFF3D6",
        "BX_Moon": "#FFF0C8",
        # the neon
        "BX_Neon": "#FFD23F",
        "BX_NeonWarm": "#FFB43A",
        # the ring
        "BX_Canvas": "#E8DDC2",
        "BX_CanvasEdge": "#D8CBAA",
        "BX_Star1": "#C9A55A",
        "BX_Skirt": "#6E1A2A",
        "BX_PadRed": "#C8322B",
        "BX_PadBlue": "#2F5FBF",
        "BX_PadCream": "#EFE6D2",
        "BX_RopeCream": "#F1E8D6",
        "BX_Bucket": "#9DA3A8",
        "BX_Water": "#5E9EC2",
        "BX_Chalk": "#F6F3EC",
        "BX_Pine": "#B07A45",
        "BX_PineDark": "#8A5A30",
        # the gym and the shop
        "BX_Locker": "#6B4A2A",
        "BX_LockerDark": "#4A301A",
        "BX_LockerInside": "#1F150E",
        "BX_Towel": "#F4EFE6",
        "BX_TowelRed": "#C8453A",
        "BX_BagLeather": "#5E1F16",
        "BX_BagStrap": "#2A1410",
        "BX_SpeedBag": "#9A3A28",
        "BX_Rubber": "#26262A",
        "BX_Tape": "#F2EEE4",
        "BX_BeltStrap": "#17131A",
        "BX_Jewel": "#C8203A",
        "BX_CaseBack": "#4E1422",
        "BX_Paper": "#EFE3C8",
        "BX_Poster1": "#C8453A",
        "BX_Poster2": "#3A6FB0",
        "BX_PosterInk": "#2A1E1A",
        # the gloves
        "BX_GloveRed": "#C62A2A",
        "BX_GloveRedDark": "#8E1A1C",
        "BX_GloveBlue": "#2E62C8",
        "BX_GloveBlueDark": "#1C3C82",
        "BX_GloveWhite": "#F2EEE6",
        "BX_TigerOrange": "#E8862A",
        "BX_TigerBlack": "#1C1614",
    }
)
SKY = {"BX_SkyTop", "BX_SkyMid", "BX_SkyLow", "BX_Star", "BX_Moon"}
NEON |= {"BX_Neon", "BX_NeonWarm"}
POLISH |= {"BX_Parquet", "BX_ParquetDark", "BX_ParquetLight", "BX_TileWhite", "BX_TileBlack"}
SHEEN |= {"BX_Mirror", "BX_MirrorLight", "BX_MirrorDark", "BX_Steel", "BX_SteelDark", "BX_Bucket", "BX_Water", "BX_BagLeather", "BX_SpeedBag", "BX_BeltStrap", "BX_Jewel", "BX_Rubber", "BX_GloveRed", "BX_GloveRedDark", "BX_GloveBlue", "BX_GloveBlueDark", "BX_TigerOrange", "BX_TigerBlack"}
DECAL2 |= {"BX_Star1", "BX_PosterInk", "BX_Poster1", "BX_Poster2"}
CATEGORIES["CS_Sky"] = 0.8
_kit_category = category


def category(name):
    return "CS_Sky" if name in SKY else _kit_category(name)


def read_ring_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "boxing_ring.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


def read_ring_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("bleacher", "gymBench", "chesterfield", "barStool", "dining"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"top": y + h / 2}
    return out


def tube(M, points, r, mat, sides=8):
    """One continuous round tube through the game points (rings shared along it, capped at the ends
    only): a rope the game can bend vertex by vertex."""
    bm = M.bm
    pts = [W(*p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = d.orthogonal().normalized()
        q = d.cross(n)
        rings.append([bm.verts.new(p + (n * math.cos(2 * math.pi * k / sides) + q * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            k1 = (k + 1) % sides
            f = bm.faces.new((a[k], a[k1], b[k1], b[k]))
            f.material_index = M.m(mat)
            f.smooth = True
    bm.faces.new(list(reversed(rings[0]))).material_index = M.m(mat)
    bm.faces.new(rings[-1]).material_index = M.m(mat)


def rng(seed):
    s = [seed & 0xFFFFFFFF or 1]

    def r():
        s[0] = (s[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return s[0] / 4294967296

    return r


# ---------------------------------------------------------------------------------------------
# text: a font curve turned into polygons (x right, y up, z out of the page), centred


def text_polys(text, size, depth=0.0):
    cu = bpy.data.curves.new("BX_Text", type="FONT")
    cu.body = text
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.resolution_u = 2
    ob = bpy.data.objects.new("BX_Text", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    polys = [[tuple(me.vertices[i].co) for i in p.vertices] for p in me.polygons]
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    return polys


def text_on(M, polys, place, mat, solid, normal=(0.0, 0.0, 1.0)):
    """Font polygons into the mesh: `place` maps a font point (fx, fy, fz) to a game point. A solid
    text keeps its sides (normals recalculated with the rest); a flat one is a decal facing `normal`."""
    bm = M.bm
    for poly in polys:
        if solid:
            vs = [bm.verts.new(W(*place(p))) for p in poly]
            try:
                bm.faces.new(vs).material_index = M.m(mat)
            except ValueError:
                pass
        else:
            if any(abs(p[2]) > 1e-6 for p in poly):
                continue
            flat(M, [place(p) for p in poly], mat, normal)


# ---------------------------------------------------------------------------------------------
# the floor


def herringbone_at(M, x0, x1, z0, z1, y, ox, oz, tones, wp=0.19):
    """Herringbone parquet over a rectangle, on a lattice anchored at (ox, oz) so neighbouring
    rectangles meet seamlessly (the kit's own anchors each at its corner)."""
    rnd = random_for(int((x0 + 50) * 7 + (z0 + 50) * 13))
    lp = wp * 4
    # a lattice point (k, m) sits at (ox + k wp + m lp, oz + k wp - m lp): k runs along the
    # diagonal x + z, m across it
    kmin = int(((x0 - ox) + (z0 - oz)) / (2 * wp)) - 8
    kmax = int(((x1 - ox) + (z1 - oz)) / (2 * wp)) + 8
    mmin = int(((x0 - ox) - (z1 - oz)) / (2 * lp)) - 3
    mmax = int(((x1 - ox) - (z0 - oz)) / (2 * lp)) + 3
    for m in range(mmin, mmax + 1):
        for k in range(kmin, kmax + 1):
            px = ox + k * wp + m * lp
            pz = oz + k * wp - m * lp
            for rx0, rx1, rz0, rz1 in ((px, px + lp, pz, pz + wp), (px, px + wp, pz + wp, pz + wp + lp)):
                if rx1 < x0 or rx0 > x1 or rz1 < z0 or rz0 > z1:
                    continue
                q = clip_rect([(rx0, rz0), (rx1, rz0), (rx1, rz1), (rx0, rz1)], x0, x1, z0, z1)
                if len(q) >= 3 and poly_area(q) > 1e-5:
                    floor_poly(M, q, y, tones[int(rnd() * len(tones))])


def random_for(seed):
    return rng(seed)


def checker(M, x0, x1, z0, z1, y, size=0.5):
    """Black-and-white tiles on the hall's own lattice."""
    i0, i1 = int(math.floor(x0 / size)), int(math.ceil(x1 / size))
    j0, j1 = int(math.floor(z0 / size)), int(math.ceil(z1 / size))
    for i in range(i0, i1):
        for j in range(j0, j1):
            q = clip_rect([(i * size, j * size), ((i + 1) * size, j * size), ((i + 1) * size, (j + 1) * size), (i * size, (j + 1) * size)], x0, x1, z0, z1)
            if len(q) >= 3 and poly_area(q) > 1e-5:
                floor_poly(M, q, y, "BX_TileWhite" if (i + j) % 2 == 0 else "BX_TileBlack")


def build_floor(M, L):
    h = L["half"]
    slab(M, [(-h, -h), (h, -h), (h, h), (-h, h)], -0.6, 0.0, "CS_Slab")
    a = L["ring"]["apron"]
    tones = ("BX_Parquet", "BX_ParquetDark", "BX_ParquetLight", "BX_Parquet")
    y = 0.002
    for zn in L["zones"]:
        x0, x1, z0, z1 = zn["x0"], zn["x1"], zn["z0"], zn["z1"]
        if zn["floor"] == "checker":
            checker(M, x0, x1, z0, z1, y)
            continue
        # the parquet, round the ring (never under it)
        rects = [(x0, x1, z0, z1)]
        if zn["id"] == "ring":
            rects = [(x0, x1, z0, -a), (x0, x1, a, z1), (x0, -a, -a, a), (a, x1, -a, a)]
        for r in rects:
            herringbone_at(M, r[0], r[1], r[2], r[3], y, -h, -h, tones)
    # brass strips where the floors meet
    box(M, -h, -5.6, 0.0, 0.006, -5.63, -5.57, "CS_Brass")
    box(M, -5.63, -5.57, 0.0, 0.006, -5.6, h, "CS_Brass")
    box(M, 3.6, h, 0.0, 0.006, -5.63, -5.57, "CS_Brass")
    box(M, 3.57, 3.63, 0.0, 0.006, -h, -5.6, "CS_Brass")


# ---------------------------------------------------------------------------------------------
# the walls: oak wainscot, brick, the iron beam, sash windows, piers and drapes, the neon, posters

FEATURES = []  # (wall, u0, u1, v0, v1): no brick drawn there


def wall_features(L):
    FEATURES.clear()
    w = L["windows"]
    # (each a little inside what covers it: a brick half behind a frame is hidden by it, and no
    # mortar shows round the edge)
    for u in w["north"]:
        FEATURES.append(("z", u - w["w"] / 2 + 0.02, u + w["w"] / 2 - 0.02, w["y0"] - 0.04, w["y1"] + 0.02))
    for u in w["west"]:
        FEATURES.append(("x", u - w["w"] / 2 + 0.02, u + w["w"] / 2 - 0.02, w["y0"] - 0.04, w["y1"] + 0.02))
    for u in L["pilasters"]["north"]:
        FEATURES.append(("z", u - 0.16, u + 0.16, 0.0, 9.0))
    for u in L["pilasters"]["west"]:
        FEATURES.append(("x", u - 0.16, u + 0.16, 0.0, 9.0))
    n = L["neon"]
    FEATURES.append(("z", n["x"] - 2.25, n["x"] + 2.25, n["y"] - 0.26, n["y"] + 0.26))
    for p in L["posters"]:
        FEATURES.append((p["wall"], p["at"] - p["w"] / 2 + 0.03, p["at"] + p["w"] / 2 - 0.03, p["y"] - p["h"] / 2 + 0.03, p["y"] + p["h"] / 2 - 0.03))
    m = L["mirrors"]
    FEATURES.append(("z", m["x0"], m["x1"], m["y0"], m["y1"]))


def covered(wall, u0, u1, v0, v1):
    for w, a0, a1, b0, b1 in FEATURES:
        if w == wall and u1 > a0 and u0 < a1 and v1 > b0 and v0 < b1:
            return True
    return False


def build_walls(M, L):
    h = L["half"]
    t = L["walls"]["t"]
    top = L["walls"]["h"]
    face = wall_face(L)
    ws = L["walls"]["wainscot"]
    # the masonry behind it all, in mortar (the bricks stand a hair proud of it)
    box(M, -h, h, 0.0, top, -h, face - 0.004, "BX_Mortar")
    box(M, -h, face - 0.004, 0.0, top, face - 0.004, h, "BX_Mortar")
    beam = top - 0.28
    r = rng(7)
    for wall in ("z", "x"):
        u0, u1 = face, h
        # the oak wainscot: a skirting, raised panels between stiles, a cap rail
        wall_box(M, L, wall, u0, u1, 0.0, 0.14, 0.0, 0.06, "BX_OakDark")
        wall_box(M, L, wall, u0, u1, 0.14, ws, 0.0, 0.03, "BX_Oak")
        u = u0 + 0.1
        while u < u1 - 0.5:
            wall_box(M, L, wall, u, u + 0.06, 0.14, ws - 0.08, 0.03, 0.05, "BX_OakDark")
            wall_box(M, L, wall, u + 0.14, min(u + 0.86, u1 - 0.05), 0.26, ws - 0.2, 0.03, 0.045, "BX_Oak")
            u += 0.94
        wall_box(M, L, wall, u0, u1, ws - 0.08, ws, 0.0, 0.07, "BX_OakDark")
        # the brick, running bond, above it to the beam
        bh, bl, gap = 0.13, 0.42, 0.024
        row = 0
        v = ws + 0.03
        while v + bh < beam - 0.02:
            off = (bl + gap) / 2 if row % 2 else 0.0
            u = u0 - off
            while u < u1:
                a, b = max(u, u0), min(u + bl, u1)
                if b - a > 0.05 and not covered(wall, a, b, v, v + bh):
                    tone = r()
                    wall_quad(M, L, wall, a, b, v, v + bh, 0.004, "BX_BrickDark" if tone < 0.3 else "BX_BrickLight" if tone > 0.82 else "BX_Brick")
                u += bl + gap
            v += bh + gap
            row += 1
        # the iron beam along the top
        wall_box(M, L, wall, u0, u1, beam, beam + 0.05, 0.0, 0.2, "BX_SteelDark")
        wall_box(M, L, wall, u0, u1, beam + 0.05, top - 0.05, 0.0, 0.06, "BX_Steel")
        wall_box(M, L, wall, u0, u1, top - 0.05, top, 0.0, 0.2, "BX_SteelDark")
        k = u0 + 0.3
        while k < u1:
            wblob(M, L, wall, k, 0.0, beam + 0.12, 0.07, 0.02, 0.02, 0.012, "BX_Steel", cuts=1)
            k += 0.6
    # the corner where the walls meet: a brick quoin
    box(M, face - 0.004, face + 0.08, ws, beam, face - 0.004, face + 0.08, "BX_BrickDark")
    for wall, key in (("z", "north"), ("x", "west")):
        for u in L["windows"][key]:
            sash_window(M, L, wall, u, r)
        for u in L["pilasters"][key]:
            pier(M, L, wall, u)
    neon(M, L)
    for p in L["posters"]:
        poster(M, L, p)
    mirrors(M, L)


def mirrors(M, L):
    """The gym's two tall mirrors side by side on the north wall, in dark oak frames standing proud
    of the wainscot: pale glass, lighter up top and darker at the foot, a streak of light across each."""
    m = L["mirrors"]
    mid = (m["x0"] + m["x1"]) / 2
    for a, b in ((m["x0"], mid - 0.03), (mid + 0.03, m["x1"])):
        at = (a + b) / 2
        hw = (b - a) / 2
        y0, y1 = m["y0"], m["y1"]
        wbox(M, L, "z", at, -hw - 0.05, hw + 0.05, y0 - 0.05, y1 + 0.05, 0.0, 0.085, "BX_OakDark")
        wbox(M, L, "z", at, -hw, hw, y0, y1, 0.0, 0.09, "BX_Mirror")
        wall_quad_u(M, L, "z", at, -hw, hw, y1 - (y1 - y0) * 0.3, y1, 0.092, "BX_MirrorLight")
        wall_quad_u(M, L, "z", at, -hw, hw, y0, y0 + (y1 - y0) * 0.22, 0.092, "BX_MirrorDark")
        # the streak: a stepped diagonal of light, low left to high right
        for k in range(7):
            u = -hw * 0.7 + k * hw * 0.2
            v = y0 + 0.28 + k * 0.17
            wall_quad_u(M, L, "z", at, u, u + hw * 0.24, v, v + 0.2, 0.094, "BX_MirrorLight")
    # the brass rail across the foot of both
    wbox(M, L, "z", mid, m["x0"] - mid - 0.05, m["x1"] - mid + 0.05, m["y0"] - 0.1, m["y0"] - 0.06, 0.0, 0.1, "CS_Brass")


def sash_window(M, L, wall, at, r):
    """A tall steel factory window: a deep frame, three columns of four panes onto a starry night,
    a crescent moon in one, a concrete sill."""
    w = L["windows"]
    hw = w["w"] / 2
    y0, y1 = w["y0"], w["y1"]
    # the reveal and the sky beyond it, graded top to bottom
    wbox(M, L, wall, at, -hw - 0.07, hw + 0.07, y0 - 0.08, y0, -0.01, 0.12, "CS_MarbleLight")
    cols, rows = 3, 4
    for i in range(cols):
        for j in range(rows):
            a = -hw + (2 * hw) * i / cols
            b = -hw + (2 * hw) * (i + 1) / cols
            c = y0 + (y1 - y0) * j / rows
            d = y0 + (y1 - y0) * (j + 1) / rows
            tone = "BX_SkyLow" if j == 0 else "BX_SkyMid" if j < 3 else "BX_SkyTop"
            wall_quad_u(M, L, wall, at, a, b, c, d, 0.006, tone)
            # a few stars
            for _ in range(2):
                sx = a + 0.05 + (b - a - 0.1) * r()
                sy = c + 0.05 + (d - c - 0.1) * r()
                if j > 0:
                    wall_quad_u(M, L, wall, at, sx - 0.012, sx + 0.012, sy - 0.012, sy + 0.012, 0.009, "BX_Star")
    if wall == "x" and abs(at + 1.2) < 0.01:
        # the crescent moon, high in the window
        mx, my = hw * 0.45, y1 - 0.38
        outer = [(mx + 0.13 * math.cos(2 * math.pi * k / 18), my + 0.13 * math.sin(2 * math.pi * k / 18)) for k in range(18)]
        wshape(M, L, wall, at, outer, 0.008, 0.01, "BX_Moon")
        inner = [(mx + 0.06 + 0.11 * math.cos(2 * math.pi * k / 18), my + 0.04 + 0.11 * math.sin(2 * math.pi * k / 18)) for k in range(18)]
        wshape(M, L, wall, at, inner, 0.01, 0.012, "BX_SkyTop")
    # the steel: the outer frame, the mullions and the transoms
    wbox(M, L, wall, at, -hw - 0.06, hw + 0.06, y1, y1 + 0.07, 0.0, 0.08, "BX_SteelDark")
    wbox(M, L, wall, at, -hw - 0.06, -hw, y0, y1, 0.0, 0.08, "BX_SteelDark")
    wbox(M, L, wall, at, hw, hw + 0.06, y0, y1, 0.0, 0.08, "BX_SteelDark")
    for i in range(1, cols):
        u = -hw + 2 * hw * i / cols
        wbox(M, L, wall, at, u - 0.018, u + 0.018, y0, y1, 0.0, 0.06, "BX_Steel")
    for j in range(1, rows):
        v = y0 + (y1 - y0) * j / rows
        wbox(M, L, wall, at, -hw, hw, v - 0.015, v + 0.015, 0.0, 0.06 if j != 2 else 0.09, "BX_Steel")
    # the sash's pull and the sill
    wbox(M, L, wall, at, -0.08, 0.08, y0 + (y1 - y0) / 2 - 0.05, y0 + (y1 - y0) / 2 - 0.02, 0.09, 0.12, "CS_Brass")
    wbox(M, L, wall, at, -hw - 0.1, hw + 0.1, y0 - 0.12, y0 - 0.06, 0.0, 0.16, "CS_MarbleLight")


def wall_quad_u(M, L, wall, at, u0, u1, v0, v1, d, mat):
    if wall == "z":
        wall_quad(M, L, wall, at + u0, at + u1, v0, v1, d, mat)
    else:
        wall_quad(M, L, wall, at - u1, at - u0, v0, v1, d, mat)


def pier(M, L, wall, at):
    """An oak pier against the wall, and burgundy velvet drapes either side of it, hung from a brass
    rod under the beam and gathered to it at shoulder height by gold tiebacks."""
    top = L["walls"]["h"] - 0.28
    wbox(M, L, wall, at, -0.2, 0.2, 0.0, top, 0.0, 0.14, "BX_Oak")
    wbox(M, L, wall, at, -0.23, 0.23, 0.0, 0.2, 0.0, 0.17, "BX_OakDark")
    wbox(M, L, wall, at, -0.23, 0.23, top - 0.16, top, 0.0, 0.17, "BX_OakDark")
    for k in (-1, 1):
        wbox(M, L, wall, at, k * 0.11 - 0.015, k * 0.11 + 0.015, 0.3, top - 0.25, 0.14, 0.15, "BX_OakDark")
    rod = top - 0.12
    wbar(M, L, wall, at, (-1.05, rod), (1.05, rod), 0.2, 0.022, "CS_Brass", sides=8)
    for side in (-1, 1):
        wblob(M, L, wall, at, side * 1.07, rod, 0.2, 0.04, 0.04, 0.04, "CS_Gold", cuts=1)
        tie_u, tie_v = side * 0.3, 1.45
        folds = 6
        for f in range(folds):
            k = (f + 0.5) / folds
            top_u = side * (0.25 + 0.78 * k)
            mid_u = tie_u + side * 0.05 * k
            foot_u = side * (0.24 + 0.4 * k)
            d = 0.22 + 0.05 * math.sin(f * 1.7)
            wbar(M, L, wall, at, (top_u, rod - 0.02), (mid_u, tie_v), d, 0.06, "CS_Velvet", sides=6)
            wbar(M, L, wall, at, (mid_u, tie_v), (foot_u, 0.02), d + 0.02, 0.07, "CS_Velvet", sides=6)
        # the gold tieback and its tassel
        wblob(M, L, wall, at, tie_u, tie_v, 0.27, 0.12, 0.05, 0.1, "CS_Gold", cuts=2)
        wbar(M, L, wall, at, (tie_u + side * 0.05, tie_v - 0.02), (tie_u + side * 0.08, tie_v - 0.28), 0.32, 0.02, "CS_Gold", sides=6)


def neon(M, L):
    """The yellow neon over the lockers: the hall's name in glowing letters on a black raceway,
    a tube round it."""
    n = L["neon"]
    face = wall_face(L)
    cx, cy = n["x"], n["y"]
    wbox(M, L, "z", cx, -2.35, 2.35, cy - 0.36, cy + 0.36, 0.0, 0.05, "BX_SteelDark")
    for yy in (cy - 0.33, cy + 0.33):
        wbar(M, L, "z", cx, (-2.3, yy), (2.3, yy), 0.07, 0.018, "BX_NeonWarm", sides=6)
    for uu in (-2.3, 2.3):
        wbar(M, L, "z", cx, (uu, cy - 0.33), (uu, cy + 0.33), 0.07, 0.018, "BX_NeonWarm", sides=6)
    polys = text_polys(n["text"], n["size"], depth=0.018)
    text_on(M, polys, lambda p: (cx + p[0], cy + p[1] - 0.02, face + 0.09 + p[2]), "BX_Neon", True)
    # its brackets
    for uu in (-1.6, 0.0, 1.6):
        wbox(M, L, "z", cx, uu - 0.03, uu + 0.03, cy - 0.45, cy - 0.36, 0.0, 0.08, "BX_Steel")


def poster(M, L, p):
    """An old fight bill in a slim black frame: cream paper, a coloured band, two gloves, the bill."""
    wall, at, yc, w, h = p["wall"], p["at"], p["y"], p["w"], p["h"]
    tint = "BX_Poster1" if p["tint"].upper() == "#C8453A" else "BX_Poster2"
    wbox(M, L, wall, at, -w / 2 - 0.03, w / 2 + 0.03, yc - h / 2 - 0.03, yc + h / 2 + 0.03, 0.0, 0.03, "CS_Black")
    wbox(M, L, wall, at, -w / 2, w / 2, yc - h / 2, yc + h / 2, 0.0, 0.035, "BX_Paper")
    wbox(M, L, wall, at, -w / 2 + 0.04, w / 2 - 0.04, yc + h / 2 - 0.2, yc + h / 2 - 0.05, 0.0, 0.037, tint)
    for side in (-1, 1):
        wblob(M, L, wall, at, side * 0.12, yc + 0.02, 0.045, 0.08, 0.1, 0.03, "BX_GloveRed" if side < 0 else "BX_GloveRedDark", cuts=2)
    face = wall_face(L)
    out = (0.0, 0.0, 1.0) if wall == "z" else (1.0, 0.0, 0.0)
    for words, size, yy in ((p["title"], 0.1, yc - h / 2 + 0.16), ("VS", 0.07, yc + 0.02)):
        polys = text_polys(words, size)
        if wall == "z":
            place = lambda q, yy=yy: (at + q[0], yy + q[1], face + 0.039)
        else:
            place = lambda q, yy=yy: (face + 0.039, yy + q[1], at - q[0])
        text_on(M, polys, place, "BX_PosterInk", False, out)


# ---------------------------------------------------------------------------------------------
# the ring


def corner_pad_colour(L, sx, sz):
    for name, mat in (("red", "BX_PadRed"), ("blue", "BX_PadBlue")):
        c = L["corners"][name]
        if c[0] == sx and c[1] == sz:
            return mat
    return "BX_PadCream"


def build_ring(M, L, nodes):
    g = L["ring"]
    cx, cz = g["x"], g["z"]
    a, rp, cy = g["apron"], g["rope"], g["canvas"]
    # the platform: the velvet skirt round the sides, a gold band, the canvas on top
    box(M, cx - a, cx + a, 0.0, cy - 0.08, cz - a, cz + a, "BX_Skirt")
    box(M, cx - a - 0.01, cx + a + 0.01, cy - 0.2, cy - 0.16, cz - a - 0.01, cz + a + 0.01, "CS_Gold")
    box(M, cx - a - 0.01, cx + a + 0.01, 0.04, 0.08, cz - a - 0.01, cz + a + 0.01, "CS_Gold")
    box(M, cx - a, cx + a, cy - 0.08, cy, cz - a, cz + a, "BX_CanvasEdge", top="BX_CanvasEdge")
    floor_poly(M, [(cx - rp, cz - rp), (cx + rp, cz - rp), (cx + rp, cz + rp), (cx - rp, cz + rp)], cy + 0.003, "BX_Canvas")
    # the faded gold star in the middle, a ring round it
    star = []
    for k in range(10):
        ang = math.pi / 2 + k * math.pi / 5
        rr = 1.25 if k % 2 == 0 else 0.5
        star.append((cx + rr * math.cos(ang), cz - rr * math.sin(ang)))
    for k in range(10):
        floor_poly(M, [(cx, cz), star[k], star[(k + 1) % 10]], cy + 0.006, "BX_Star1")
    ring_o = circle(cx, cz, 1.55, 40)
    ring_i = circle(cx, cz, 1.47, 40)
    for k in range(40):
        floor_poly(M, [ring_i[k], ring_o[k], ring_o[(k + 1) % 40], ring_i[(k + 1) % 40]], cy + 0.006, "BX_Star1")
    # the hall's name in gold on the skirt's two open faces (south, east)
    polys = text_polys("THE VELVET RING", 0.28)
    text_on(M, polys, lambda p: (cx + p[0], cy * 0.46 + p[1], cz + a + 0.004), "CS_Gold", False, (0.0, 0.0, 1.0))
    text_on(M, polys, lambda p: (cx + a + 0.004, cy * 0.46 + p[1], cz - p[0]), "CS_Gold", False, (1.0, 0.0, 0.0))
    # the posts, their pads and turnbuckles
    top = cy + g["post"]
    for sx in (-1, 1):
        for sz in (-1, 1):
            px, pz = cx + sx * rp, cz + sz * rp
            cylinder(M, (px, 0.0, pz), (px, top, pz), 0.06, "BX_Steel", sides=10)
            lathe(M, px, pz, [(0, top), (0.075, top), (0.07, top + 0.04), (0, top + 0.05)], "CS_Chrome", segs=10)
            pad = corner_pad_colour(L, sx, sz)
            obox(M, px, pz, math.atan2(-sx, -sz), -0.02, 0.13, -0.13, 0.13, cy + 0.2, cy + g["ropes"][-1] + 0.1, pad)
            for ry in g["ropes"]:
                blob(M, px - sx * 0.06, cy + ry, pz - sz * 0.06, 0.05, 0.04, 0.05, "CS_Chrome", cuts=1)
    # the ropes: a node for each side, bent by the game (their vertices spaced along the side)
    for side in ("n", "s", "e", "w"):
        R = Mesh()
        for i, ry in enumerate(g["ropes"]):
            mat = "CS_Velvet" if i != 1 else "BX_RopeCream"
            segs = 20
            ts = [-rp + 2 * rp * k / segs for k in range(segs + 1)]
            if side in ("n", "s"):
                zz = cz + (rp if side == "s" else -rp)
                pts = [(cx + t, cy + ry, zz) for t in ts]
            else:
                xx = cx + (rp if side == "e" else -rp)
                pts = [(xx, cy + ry, cz + t) for t in ts]
            tube(R, pts, 0.028, mat, sides=7)
        nodes.append({"name": f"Prop_Ropes_{side}", "mesh": R, "origin": (cx, cy, cz), "force": "CS_Clay"})
    # the corner steps (Red and Blue): four treads down the diagonal from the apron's corner
    st = L["steps"]
    for name in ("red", "blue"):
        sx, sz = L["corners"][name]
        yaw = math.atan2(sx, sz)  # out of the ring along the diagonal
        for k in range(st["count"]):
            o0 = st["out"] * k / st["count"]
            o1 = st["out"] * (k + 1) / st["count"]
            om = (o0 + o1) / 2
            px, pz = cx + sx * (a + om), cz + sz * (a + om)
            half = (o1 - o0) * math.sqrt(2) / 2
            h1 = cy * (st["count"] - k) / (st["count"] + 1)
            obox(M, px, pz, yaw, -half, half, -st["w"] / 2, st["w"] / 2, h1 - 0.05, h1, "BX_Pine")
            obox(M, px, pz, yaw, -half + 0.02, half - 0.02, -st["w"] / 2 + 0.03, st["w"] / 2 - 0.03, 0.0, h1 - 0.05, "BX_PineDark")
        # the stool inside the corner, the bucket and the chalk basin on the apron
        ix, iz = cx + sx * (rp - 0.38), cz + sz * (rp - 0.38)
        with lifted(cy):
            lathe(M, ix, iz, [(0, 0), (0.17, 0), (0.17, 0.02), (0, 0.02)], "BX_PineDark", segs=12)
            for k in range(3):
                ang = 2 * math.pi * k / 3 + 0.4
                cylinder(M, (ix + 0.13 * math.cos(ang), 0.0, iz + 0.13 * math.sin(ang)), (ix + 0.08 * math.cos(ang), 0.42, iz + 0.08 * math.sin(ang)), 0.02, "BX_Pine", sides=6)
            lathe(M, ix, iz, [(0, 0.42), (0.19, 0.42), (0.2, 0.46), (0, 0.47)], "BX_PadRed" if name == "red" else "BX_PadBlue", segs=14)
            bx, bz = cx + sx * (rp + 0.23), cz + sz * (rp - 0.55)
            lathe(M, bx, bz, [(0, 0), (0.12, 0), (0.15, 0.24), (0.15, 0.25), (0, 0.25)], "BX_Bucket", segs=14)
            lathe(M, bx, bz, [(0, 0.2), (0.14, 0.2), (0.14, 0.215), (0, 0.215)], "BX_Water", segs=14)
            cylinder(M, (bx - 0.14, 0.24, bz), (bx, 0.36, bz), 0.008, "BX_Steel", sides=4)
            cylinder(M, (bx, 0.36, bz), (bx + 0.14, 0.24, bz), 0.008, "BX_Steel", sides=4)
            blob(M, bx + 0.05, 0.3, bz + 0.05, 0.08, 0.02, 0.06, "BX_Towel", cuts=1)
            kx, kz = cx + sx * (rp - 0.55), cz + sz * (rp + 0.23)
            lathe(M, kx, kz, [(0, 0), (0.16, 0), (0.18, 0.1), (0, 0.1)], "CS_Brass", segs=14)
            lathe(M, kx, kz, [(0, 0.07), (0.16, 0.07), (0.16, 0.085), (0, 0.095)], "BX_Chalk", segs=14)


def build_lamp(M, L):
    """The industrial dome lamp over the ring on its chain (the game lights the ring from it)."""
    lp = L["lamp"]
    cx, cz = L["ring"]["x"], L["ring"]["z"]
    y = lp["y"]
    r = lp["r"]
    lathe(M, cx, cz, [(0, y), (r, y), (r * 0.96, y + 0.06), (r * 0.72, y + 0.28), (r * 0.3, y + 0.42), (0.1, y + 0.5), (0, y + 0.52)], "BX_SteelDark", segs=24)
    lathe(M, cx, cz, [(0, y - 0.01), (r * 0.94, y - 0.01), (r * 0.94, y), (0, y)], "CS_Bulb", segs=24)
    lathe(M, cx, cz, [(0, y + 0.5), (0.06, y + 0.5), (0.06, y + 0.62), (0, y + 0.62)], "CS_Brass", segs=10)
    # the chain, link by link, up out of sight
    yy = y + 0.62
    k = 0
    while yy < lp["chain"]:
        if k % 2 == 0:
            blob(M, cx, yy + 0.05, cz, 0.018, 0.05, 0.008, "BX_Steel", cuts=1)
        else:
            blob(M, cx, yy + 0.05, cz, 0.008, 0.05, 0.018, "BX_Steel", cuts=1)
        yy += 0.085
        k += 1


def build_bell_table(M, L, cushions):
    b = L["bell"]
    x, z, hl, hd, top = b["x"], b["z"], b["len"] / 2, b["d"] / 2, b["h"]
    for lx in (x - hl + 0.08, x + hl - 0.08):
        for lz in (z - hd + 0.06, z + hd - 0.06):
            cylinder(M, (lx, 0.0, lz), (lx, top - 0.05, lz), 0.03, "CS_Mahogany", sides=8)
    box(M, x - hl, x + hl, top - 0.06, top, z - hd, z + hd, "CS_Mahogany")
    box(M, x - hl, x + hl, top - 0.2, top - 0.06, z + hd - 0.03, z + hd, "BX_Skirt")
    # the bell: a brass gong on its oak plaque, the hammer beside it
    bx = x + hl - 0.35
    box(M, bx - 0.18, bx + 0.18, top, top + 0.04, z - 0.14, z + 0.14, "BX_Oak")
    box(M, bx - 0.16, bx + 0.16, top + 0.04, top + 0.34, z - 0.1, z - 0.06, "BX_Oak")
    cylinder(M, (bx, top + 0.2, z - 0.06), (bx, top + 0.2, z + 0.02), 0.12, "CS_Brass", sides=18, r_end=0.13)
    blob(M, bx, top + 0.2, z + 0.03, 0.03, 0.03, 0.015, "CS_Gold", cuts=1)
    cylinder(M, (bx - 0.3, top + 0.02, z + 0.12), (bx - 0.08, top + 0.02, z + 0.2), 0.012, "BX_OakDark", sides=6)
    blob(M, bx - 0.07, top + 0.03, z + 0.2, 0.035, 0.025, 0.025, "BX_Rubber", cuts=1)
    # the judges' cards and a stopwatch
    for k, dx in enumerate((-0.85, 0.0)):
        box(M, x + dx - 0.12, x + dx + 0.12, top, top + 0.008, z - 0.08, z + 0.1, "BX_Paper")
        box(M, x + dx - 0.1, x + dx + 0.1, top + 0.008, top + 0.01, z + 0.02, z + 0.04, "BX_PosterInk")
    lathe(M, x - 0.42, z - 0.05, [(0, 0), (0.05, 0), (0.05, 0.02), (0, 0.025)], "CS_Chrome", segs=12, y0=top)
    seat = cushions["dining"]["top"]
    for dx in b["chairs"]:
        folding_chair(M, x + dx, b["chairZ"], math.pi, seat)


def folding_chair(M, x, z, yaw, seat_top):
    """A wooden folding chair facing `yaw`: slatted seat, a curved back, steel legs."""
    F = Frame(x, z, yaw)
    for lx in (-0.18, 0.18):
        F.cyl(M, (lx, 0.0, 0.16), (lx, seat_top, -0.14), 0.015, "BX_Steel", sides=6)
        F.cyl(M, (lx, 0.0, -0.18), (lx, seat_top + 0.46, -0.2), 0.015, "BX_Steel", sides=6)
    for k in range(3):
        F.box(M, -0.2, 0.2, seat_top - 0.03, seat_top, -0.17 + k * 0.115, -0.08 + k * 0.115, "BX_Pine")
    F.box(M, -0.2, 0.2, seat_top + 0.25, seat_top + 0.42, -0.23, -0.19, "BX_Pine")


def build_ringside(M, L, cushions):
    rs = L["ringside"]
    for z in rs["zs"]:
        folding_chair(M, rs["x"], z, -math.pi / 2, cushions["dining"]["top"])


# ---------------------------------------------------------------------------------------------
# the lounge


def chesterfield(M, x, z, yaw, length, seat_top):
    """A tufted oxblood Chesterfield facing `yaw`: rolled arms, deep buttons, bun feet."""
    F = Frame(x, z, yaw)
    hl = length / 2
    front, back = 0.35, -0.45
    for fx in (-hl + 0.06, hl - 0.06):
        for fz in (front - 0.06, back + 0.06):
            F.blob(M, fx, 0.035, fz, 0.035, 0.035, 0.035, "CS_Gold", cuts=1)
    F.box(M, -hl + 0.02, hl - 0.02, 0.06, seat_top - 0.09, back, front, "CS_Leather")
    for lx in (-hl / 2, hl / 2):
        F.blob(M, lx, seat_top - 0.045, front - 0.2, hl / 2 - 0.04, 0.05, 0.21, "CS_Leather", cuts=3, n=3.2)
    bz = -0.22
    F.box(M, -hl + 0.02, hl - 0.02, seat_top - 0.09, seat_top + 0.36, back, bz, "CS_Leather")
    F.cyl(M, (-hl + 0.02, seat_top + 0.36, bz - 0.1), (hl - 0.02, seat_top + 0.36, bz - 0.1), 0.115, "CS_Leather", sides=12)
    for row in range(3):
        yy = seat_top + 0.08 + row * 0.1
        n = 8
        for k in range(n + 1):
            xx = -hl + 0.14 + (2 * hl - 0.28) * (k + (0.5 if row % 2 else 0)) / n
            if xx > hl - 0.12:
                continue
            F.blob(M, xx, yy, bz + 0.002, 0.014, 0.014, 0.006, "CS_LeatherDark", cuts=1)
    for side in (-1, 1):
        xa, xb = (-hl - 0.02, -hl + 0.14) if side < 0 else (hl - 0.14, hl + 0.02)
        F.box(M, xa, xb, seat_top - 0.09, seat_top + 0.16, back, front, "CS_Leather")
        F.cyl(M, ((xa + xb) / 2, seat_top + 0.16, back), ((xa + xb) / 2, seat_top + 0.16, front + 0.02), 0.1, "CS_Leather", sides=12)


def build_lounge(M, L, cushions):
    b = L["bleachers"]
    face = wall_face(L)
    front = face + b["tiers"] * b["depth"]
    bench = cushions["bleacher"]["top"]
    for tier in range(b["tiers"]):
        x1 = front - tier * b["depth"]
        x0 = x1 - b["depth"]
        fl = tier * b["rise"]
        if fl > 0:
            # the riser, stepped up from the one in front
            box(M, face, x1, 0.0, fl, b["z0"], b["z1"], "BX_PineDark", top="BX_Pine")
            box(M, x1 - 0.02, x1, 0.0, fl, b["z0"], b["z1"], "BX_OakDark")
        # the bench plank near the tier's front edge, on its legs
        bx0, bx1 = x1 - 0.34, x1 - 0.02
        box(M, bx0, bx1, fl + bench - 0.05, fl + bench, b["z0"] + 0.05, b["z1"] - 0.05, "BX_Pine")
        box(M, bx0 + 0.02, bx1 - 0.02, fl + bench - 0.07, fl + bench - 0.05, b["z0"] + 0.05, b["z1"] - 0.05, "BX_PineDark")
        zz = b["z0"] + 0.25
        while zz < b["z1"] - 0.1:
            box(M, bx0 + 0.04, bx1 - 0.04, fl, fl + bench - 0.07, zz - 0.03, zz + 0.03, "BX_Steel")
            zz += 1.3
    # the bleachers' ends
    for zz in (b["z0"], b["z1"]):
        slab(M, [(face, zz - 0.03), (front, zz - 0.03), (front, zz + 0.03), (face, zz + 0.03)], 0.0, 0.2, "BX_OakDark")
    for s in L["sofas"]:
        chesterfield(M, s["x"], s["z"], math.pi / 2, s["len"], cushions["chesterfield"]["top"])
    stool_top = cushions["barStool"]["top"]
    for c in L["cocktails"]:
        x, z = c["x"], c["z"]
        top = 0.78
        lathe(M, x, z, [(0, 0), (0.26, 0), (0.24, 0.04), (0, 0.05)], "CS_Brass", segs=16)
        cylinder(M, (x, 0.04, z), (x, top - 0.04, z), 0.04, "CS_Brass", sides=10)
        lathe(M, x, z, [(0, top - 0.04), (0.34, top - 0.04), (0.35, top), (0, top)], "CS_MarbleDark", segs=24)
        lathe(M, x, z, [(0, top - 0.05), (0.355, top - 0.05), (0.355, top - 0.03), (0, top - 0.03)], "CS_Gold", segs=24)
        # a tumbler and a coupe
        lathe(M, x + 0.1, z - 0.08, [(0, 0), (0.035, 0), (0.04, 0.09), (0, 0.09)], "CS_BottleAmber", segs=10, y0=top)
        lathe(M, x - 0.12, z + 0.06, [(0, 0), (0.04, 0), (0.008, 0.02), (0.008, 0.08), (0.05, 0.1), (0.055, 0.115), (0, 0.11)], "CS_JarGlass", segs=12, y0=top)
        for sz in (-1, 1):
            leather_stool(M, x, z + sz * 0.55, stool_top)
    build_chalkboard(M, L)


def build_chalkboard(M, L, nodes=None):
    c = L["chalkboard"]
    F = Frame(c["x"], c["z"], c["yaw"])
    w, h = c["w"], c["h"]
    y0 = 0.75
    # the easel: two front legs, a back leg, the tray, the frame round the slate
    for lx in (-w / 2 + 0.08, w / 2 - 0.08):
        F.cyl(M, (lx, 0.0, 0.1), (lx * 0.9, y0 + h + 0.12, -0.04), 0.025, "BX_Oak", sides=6)
    F.cyl(M, (0.0, 0.0, -0.45), (0.0, y0 + h + 0.1, -0.08), 0.022, "BX_Oak", sides=6)
    F.box(M, -w / 2 - 0.04, w / 2 + 0.04, y0 - 0.06, y0 - 0.02, -0.02, 0.1, "BX_OakDark")
    for k in range(3):
        F.blob(M, -0.3 + k * 0.1, y0 - 0.005, 0.05, 0.03, 0.01, 0.01, "BX_Chalk", cuts=1)
    F.box(M, -w / 2 - 0.05, w / 2 + 0.05, y0 - 0.02, y0 + h + 0.05, -0.05, -0.01, "BX_OakDark")
    F.box(M, -w / 2 - 0.05, -w / 2, y0, y0 + h, -0.01, 0.02, "BX_Oak")
    F.box(M, w / 2, w / 2 + 0.05, y0, y0 + h, -0.01, 0.02, "BX_Oak")
    F.box(M, -w / 2 - 0.05, w / 2 + 0.05, y0 + h, y0 + h + 0.05, -0.01, 0.02, "BX_Oak")
    F.box(M, -w / 2 - 0.05, w / 2 + 0.05, y0 - 0.02, y0, -0.01, 0.02, "BX_Oak")


def chalk_slate(L):
    """The slate itself: a quad with UVs across it, facing out of the easel (the game chalks it)."""
    c = L["chalkboard"]
    F = Frame(c["x"], c["z"], c["yaw"])
    w, h = c["w"], c["h"]
    y0 = 0.75
    S = Mesh()
    bm = S.bm
    uv = bm.loops.layers.uv.new("UVMap")
    lz = 0.015
    pts = [F.p(-w / 2, y0, lz), F.p(w / 2, y0, lz), F.p(w / 2, y0 + h, lz), F.p(-w / 2, y0 + h, lz)]
    vs = [bm.verts.new(W(*p)) for p in pts]
    fc = bm.faces.new(vs)
    fc.material_index = S.m("CS_Screen")
    for loop, uvv in zip(fc.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        loop[uv].uv = uvv
    fc.normal_update()
    out = Vector((math.sin(c["yaw"]), -math.cos(c["yaw"]), 0.0))
    if fc.normal.dot(out) < 0:
        fc.normal_flip()
    mid = F.p(0.0, y0 + h / 2, lz)
    return {"name": "Prop_ChalkSlate", "mesh": S, "origin": mid, "coloured": False, "recalc": False}


# ---------------------------------------------------------------------------------------------
# the gym


def build_gym(M, L, cushions, nodes):
    face = wall_face(L)
    lk = L["lockers"]
    n = lk["count"]
    lw = (lk["x1"] - lk["x0"]) / n
    z0, z1 = face, face + lk["d"]
    for i in range(n):
        x0 = lk["x0"] + i * lw
        x1 = x0 + lw
        box(M, x0 + 0.01, x1 - 0.01, 0.08, lk["h"], z0, z1 - 0.03, "BX_Locker")
        box(M, x0, x1, 0.0, 0.08, z0, z1 - 0.06, "BX_LockerDark")
        box(M, x0, x1, lk["h"], lk["h"] + 0.05, z0, z1, "BX_LockerDark")
        if i in lk["open"]:
            # the door swung open on its left hinge; the dark inside, a towel on a hook, a pair of gloves
            box(M, x0 + 0.04, x1 - 0.04, 0.12, lk["h"] - 0.04, z1 - 0.05, z1 - 0.03, "BX_LockerInside")
            hx = x0 + 0.03
            obox(M, hx, z1, math.radians(-100), 0.0, 0.02, 0.0, lw - 0.04, 0.12, lk["h"] - 0.04, "BX_Locker")
            box(M, x0 + 0.12, x1 - 0.12, 1.1, 1.62, z1 - 0.08, z1 - 0.05, "BX_TowelRed" if i % 2 else "BX_Towel")
            blob(M, x0 + lw / 2, 0.55, z1 - 0.15, 0.08, 0.1, 0.07, "BX_GloveRed", cuts=2)
        else:
            box(M, x0 + 0.04, x1 - 0.04, 0.12, lk["h"] - 0.04, z1 - 0.03, z1, "BX_Locker")
            for k in range(5):
                yy = lk["h"] - 0.25 - k * 0.05
                box(M, x0 + 0.14, x1 - 0.14, yy, yy + 0.02, z1, z1 + 0.006, "BX_LockerDark")
            box(M, x1 - 0.12, x1 - 0.08, 0.95, 1.1, z1, z1 + 0.03, "CS_Brass")
            box(M, x0 + lw / 2 - 0.05, x0 + lw / 2 + 0.05, lk["h"] - 0.14, lk["h"] - 0.08, z1, z1 + 0.008, "CS_Brass")
    # the bench and its towels
    b = L["bench"]
    top = cushions["gymBench"]["top"]
    hl = b["len"] / 2
    box(M, b["x"] - hl, b["x"] + hl, top - 0.06, top, b["z"] - 0.18, b["z"] + 0.18, "BX_Pine")
    for lx in (b["x"] - hl + 0.15, b["x"] + hl - 0.15):
        box(M, lx - 0.03, lx + 0.03, 0.0, top - 0.06, b["z"] - 0.15, b["z"] + 0.15, "BX_Steel")
    for k in range(3):
        blob(M, b["x"] + hl - 0.25, top + 0.03 + k * 0.05, b["z"], 0.17, 0.025, 0.13, "BX_Towel" if k != 1 else "BX_TowelRed", cuts=2, n=3.0)
    # the balance-beam scale
    s = L["scale"]
    sx, sz = s["x"], s["z"]
    box(M, sx - 0.3, sx + 0.3, 0.0, 0.08, sz - 0.1, sz + 0.34, "CS_Black")
    box(M, sx - 0.26, sx + 0.26, 0.08, 0.095, sz - 0.06, sz + 0.3, "BX_Rubber")
    cylinder(M, (sx, 0.08, sz - 0.14), (sx, 1.45, sz - 0.14), 0.03, "CS_Black", sides=10)
    box(M, sx - 0.3, sx + 0.3, 1.4, 1.46, sz - 0.16, sz - 0.12, "CS_Brass")
    box(M, sx - 0.05, sx - 0.02, 1.36, 1.5, sz - 0.18, sz - 0.1, "CS_Black")
    box(M, sx + 0.12, sx + 0.16, 1.37, 1.49, sz - 0.18, sz - 0.1, "CS_Black")
    blob(M, sx + 0.3, 1.43, sz - 0.14, 0.03, 0.04, 0.03, "CS_Black", cuts=1)
    lathe(M, sx, sz - 0.14, [(0, 1.5), (0.06, 1.5), (0.04, 1.6), (0, 1.62)], "CS_Brass", segs=10)
    # the heavy bag's bracket on the wall; the bag on its chain is a node (the game swings it)
    hb = L["heavyBag"]
    by = 2.75
    box(M, hb["x"] - 0.06, hb["x"] + 0.06, by - 0.6, by + 0.06, face, face + 0.08, "BX_SteelDark")
    box(M, hb["x"] - 0.04, hb["x"] + 0.04, by, by + 0.06, face, hb["z"] + 0.05, "BX_SteelDark")
    cylinder(M, (hb["x"], by - 0.55, face + 0.05), (hb["x"], by, hb["z"] - 0.25), 0.02, "BX_Steel", sides=6)
    B = Mesh()
    yy = by - 0.03
    k = 0
    while yy > 1.82:
        if k % 2 == 0:
            blob(B, hb["x"], yy - 0.04, hb["z"], 0.014, 0.04, 0.006, "BX_Steel", cuts=1)
        else:
            blob(B, hb["x"], yy - 0.04, hb["z"], 0.006, 0.04, 0.014, "BX_Steel", cuts=1)
        yy -= 0.07
        k += 1
    for k in range(4):
        ang = k * math.pi / 2 + math.pi / 4
        cylinder(B, (hb["x"], 1.84, hb["z"]), (hb["x"] + 0.18 * math.cos(ang), 1.72, hb["z"] + 0.18 * math.sin(ang)), 0.006, "BX_Steel", sides=4)
    lathe(B, hb["x"], hb["z"], [(0, 0.52), (0.14, 0.52), (0.2, 0.58), (0.21, 0.7), (0.21, 1.6), (0.2, 1.68), (0.14, 1.72), (0, 1.73)], "BX_BagLeather", segs=18)
    for yy in (0.72, 1.12, 1.52):
        lathe(B, hb["x"], hb["z"], [(0, yy), (0.215, yy), (0.215, yy + 0.05), (0, yy + 0.05)], "BX_BagStrap", segs=18)
    nodes.append({"name": "Prop_HeavyBag", "mesh": B, "origin": (hb["x"], by, hb["z"]), "force": "CS_Sheen"})
    # the speed bag's platform on its bracket; the bag is a node (the game rattles it)
    sb = L["speedBag"]
    py = sb["y"] + 0.38
    box(M, sb["x"] - 0.05, sb["x"] + 0.05, py - 0.4, py + 0.08, face, face + 0.06, "BX_SteelDark")
    box(M, sb["x"] - 0.04, sb["x"] + 0.04, py + 0.02, py + 0.06, face, sb["z"] + 0.02, "BX_SteelDark")
    lathe(M, sb["x"], sb["z"], [(0, py - 0.06), (0.36, py - 0.06), (0.36, py), (0, py)], "BX_OakDark", segs=24)
    lathe(M, sb["x"], sb["z"], [(0, py - 0.075), (0.03, py - 0.075), (0.03, py - 0.06), (0, py - 0.06)], "BX_Steel", segs=8)
    S = Mesh()
    swivel = py - 0.075
    cylinder(S, (sb["x"], swivel, sb["z"]), (sb["x"], swivel - 0.06, sb["z"]), 0.01, "BX_Steel", sides=6)
    lathe(S, sb["x"], sb["z"], [(0, swivel - 0.36), (0.07, swivel - 0.34), (0.11, swivel - 0.26), (0.1, swivel - 0.16), (0.05, swivel - 0.08), (0.02, swivel - 0.05), (0, swivel - 0.05)], "BX_SpeedBag", segs=14)
    nodes.append({"name": "Prop_SpeedBag", "mesh": S, "origin": (sb["x"], swivel, sb["z"]), "force": "CS_Sheen"})


# ---------------------------------------------------------------------------------------------
# Coach Bruno's pro shop and the trophy case


def build_shop(M, L):
    s = L["shop"]
    h = L["half"]
    face = wall_face(L)
    x0, x1 = s["x0"], h - 0.02
    zc, hd, top = s["counterZ"], s["counterD"] / 2, s["counterH"]
    plat = s["platform"]
    # the duckboard behind the counter
    box(M, x0, x1, 0.0, plat, face, zc - hd, "BX_PineDark", top="BX_Pine")
    k = face + 0.05
    while k < zc - hd - 0.05:
        box(M, x0, x1, plat, plat + 0.004, k, k + 0.012, "BX_OakDark")
        k += 0.14
    # the counter: an oak front in slats, a dark top, a brass foot rail
    box(M, x0, x1, 0.0, top - 0.05, zc - hd, zc + hd - 0.04, "BX_OakDark")
    xx = x0 + 0.05
    while xx < x1 - 0.05:
        box(M, xx, xx + 0.1, 0.1, top - 0.1, zc + hd - 0.04, zc + hd, "BX_Oak")
        xx += 0.13
    box(M, x0 - 0.02, x1, top - 0.05, top, zc - hd - 0.02, zc + hd + 0.04, "CS_MahoganyDark")
    box(M, x0, x0 + 0.04, 0.0, top - 0.05, zc - hd, zc + hd, "BX_OakDark")
    cylinder(M, (x0 + 0.1, 0.16, zc + hd + 0.14), (x1, 0.16, zc + hd + 0.14), 0.022, "CS_Brass", sides=8)
    for bx in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):
        cylinder(M, (bx, 0.16, zc + hd + 0.14), (bx, 0.16, zc + hd), 0.015, "CS_Brass", sides=6)
    # on the counter: the cash register, a glove stand, a roll of tape
    rx = x1 - 0.7
    box(M, rx - 0.22, rx + 0.22, top, top + 0.16, zc - 0.2, zc + 0.12, "CS_Brass")
    obox(M, rx, zc - 0.05, 0.0, -0.05, 0.14, -0.2, 0.2, top + 0.16, top + 0.3, "CS_Gold")
    box(M, rx - 0.16, rx + 0.16, top + 0.28, top + 0.36, zc - 0.12, zc - 0.08, "BX_PosterInk")
    for k in range(6):
        blob(M, rx - 0.12 + (k % 3) * 0.12, top + 0.18, zc + 0.02 + (k // 3) * 0.05, 0.02, 0.012, 0.015, "CS_Ivory", cuts=1)
    gx = x0 + 0.55
    cylinder(M, (gx, top, zc), (gx, top + 0.3, zc), 0.02, "CS_Brass", sides=6)
    for side in (-1, 1):
        blob(M, gx + side * 0.09, top + 0.26, zc + 0.05, 0.075, 0.09, 0.08, "BX_TigerOrange", cuts=2)
    lathe(M, gx + 0.45, zc + 0.1, [(0, 0), (0.06, 0), (0.06, 0.05), (0, 0.05)], "BX_Tape", segs=12, y0=top)
    # the back bar: shelves on the wall, gloves on pegs, tape and bottles; the PRO SHOP sign
    bb0 = face
    box(M, x0 + 0.2, x1 - 0.1, plat, plat + 0.9, bb0, bb0 + 0.42, "BX_OakDark")
    for sy in (1.45, 1.95):
        box(M, x0 + 0.2, x1 - 0.1, sy, sy + 0.04, bb0, bb0 + 0.3, "BX_Oak")
    r = rng(23)
    xx = x0 + 0.4
    while xx < x1 - 0.3:
        choice = r()
        if choice < 0.5:
            lathe(M, xx, bb0 + 0.15, [(0, 0), (0.04, 0), (0.04, 0.16), (0.02, 0.2), (0.02, 0.24), (0, 0.24)], "CS_BottleGreen" if r() < 0.5 else "CS_BottleAmber", segs=8, y0=1.49)
        else:
            lathe(M, xx, bb0 + 0.15, [(0, 0), (0.06, 0), (0.06, 0.05), (0, 0.05)], "BX_Tape", segs=10, y0=1.49)
        xx += 0.22
    xx = x0 + 0.45
    colours = ("BX_GloveRed", "BX_PadBlue", "BX_TigerOrange", "BX_GloveRed", "CS_Black", "BX_PadBlue")
    k = 0
    while xx < x1 - 0.4:
        cylinder(M, (xx, 2.52, bb0), (xx, 2.52, bb0 + 0.14), 0.012, "CS_Brass", sides=4)
        for side in (-1, 1):
            # a glove hung by its laces: the cuff up, the mitt below, the thumb in
            gx_ = xx + side * 0.08
            cylinder(M, (gx_, 2.36, bb0 + 0.13), (gx_, 2.43, bb0 + 0.13), 0.045, "BX_GloveWhite", sides=8)
            blob(M, gx_, 2.28, bb0 + 0.13, 0.06, 0.085, 0.065, colours[k % len(colours)], cuts=2)
            blob(M, gx_ - side * 0.05, 2.3, bb0 + 0.16, 0.024, 0.04, 0.026, colours[k % len(colours)], cuts=1)
            cylinder(M, (gx_, 2.43, bb0 + 0.13), (xx, 2.52, bb0 + 0.14), 0.005, "BX_Towel", sides=4)
        xx += 0.55
        k += 1
    sign_x = (x0 + x1) / 2
    wbox(M, L, "z", sign_x, -0.8, 0.8, 3.0, 3.36, 0.0, 0.05, "BX_OakDark")
    wbox(M, L, "z", sign_x, -0.76, 0.76, 3.03, 3.33, 0.05, 0.06, "CS_Black")
    polys = text_polys("PRO SHOP", 0.2)
    text_on(M, polys, lambda p: (sign_x + p[0], 3.18 + p[1], face + 0.062), "CS_Gold", False, (0.0, 0.0, 1.0))


def build_trophy(M, L):
    t = L["trophy"]
    face = wall_face(L)
    x0, x1 = t["x"] - t["w"] / 2, t["x"] + t["w"] / 2
    z0, z1 = face, face + t["d"]
    h = t["h"]
    # the cabinet: a closed oak base, a glass case above it (its frame, a velvet back, the shelf), a crown
    box(M, x0, x1, 0.0, 0.82, z0, z1, "BX_OakDark")
    box(M, x0 + 0.04, x1 - 0.04, 0.12, 0.74, z1, z1 + 0.01, "BX_Oak")
    box(M, x0, x1, 0.82, 0.86, z0, z1 + 0.02, "BX_Oak")
    box(M, x0 + 0.03, x1 - 0.03, 0.86, h - 0.2, z0, z0 + 0.03, "BX_CaseBack")
    for xx in (x0, x1 - 0.04):
        box(M, xx, xx + 0.04, 0.86, h - 0.16, z0, z1, "BX_Oak")
    box(M, x0, x1, h - 0.2, h, z0, z1 + 0.02, "BX_OakDark")
    box(M, x0 + 0.05, x1 - 0.05, h - 0.22, h - 0.2, z0 + 0.05, z1 - 0.05, "CS_Bulb")
    for xx in (x0 + 0.04, x1 - 0.04):
        box(M, xx - 0.008, xx + 0.008, 0.86, h - 0.2, z1 - 0.01, z1 + 0.005, "CS_Gold")
    box(M, x0 + 0.04, x1 - 0.04, 1.42, 1.44, z0 + 0.03, z1 - 0.06, "CS_Mirror")
    box(M, x0 + 0.04, x1 - 0.04, 1.44, 1.45, z1 - 0.07, z1 - 0.06, "CS_Gold")
    # the Velvet Championship Belt, upright on its stand
    bx, by, bz = t["x"], 1.12, z0 + t["d"] * 0.45
    box(M, bx - 0.05, bx + 0.05, 0.86, by - 0.1, bz - 0.04, bz + 0.04, "CS_Black")
    arc = 12
    for k in range(arc):
        a0 = math.pi * (0.1 + 0.8 * k / arc)
        a1 = math.pi * (0.1 + 0.8 * (k + 1) / arc)
        p0 = (bx - 0.42 * math.cos(a0), by + 0.02, bz - 0.14 * math.sin(a0) + 0.1)
        p1 = (bx - 0.42 * math.cos(a1), by + 0.02, bz - 0.14 * math.sin(a1) + 0.1)
        cylinder(M, p0, p1, 0.06, "BX_BeltStrap", sides=6)
    plate = [(bx + 0.17 * math.cos(2 * math.pi * k / 20), by + 0.12 * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    vslab(M, plate, bz + 0.1, bz + 0.13, "CS_Gold")
    for side in (-1, 1):
        side_plate = [(bx + side * 0.27 + 0.07 * math.cos(2 * math.pi * k / 12), by + 0.06 * math.sin(2 * math.pi * k / 12)) for k in range(12)]
        vslab(M, side_plate, bz + 0.07, bz + 0.1, "CS_Gold")
    blob(M, bx, by, bz + 0.14, 0.035, 0.035, 0.015, "BX_Jewel", cuts=1)
    star = []
    for k in range(10):
        ang = math.pi / 2 + k * math.pi / 5
        rr = 0.09 if k % 2 == 0 else 0.04
        star.append((bx + rr * math.cos(ang), by + rr * math.sin(ang)))
    vslab(M, star, bz + 0.13, bz + 0.135, "CS_Brass")
    # two little cups on the shelf above
    for side in (-1, 1):
        cx = t["x"] + side * 0.35
        lathe(M, cx, z0 + 0.3, [(0, 0), (0.06, 0), (0.05, 0.03), (0.015, 0.05), (0.015, 0.12), (0.07, 0.2), (0.075, 0.24), (0, 0.22)], "CS_Gold", segs=12, y0=1.44)


def build_rail(M, L):
    h = L["half"]
    y = 0.42
    for p0, p1 in (((-h + 0.1, 0, h - 0.1), (h - 0.1, 0, h - 0.1)), ((h - 0.1, 0, -h + 0.1), (h - 0.1, 0, h - 0.1))):
        cylinder(M, (p0[0], y, p0[2]), (p1[0], y, p1[2]), 0.03, "CS_Brass", sides=10)
        n = 10
        for k in range(n + 1):
            x = p0[0] + (p1[0] - p0[0]) * k / n
            z = p0[2] + (p1[2] - p0[2]) * k / n
            cylinder(M, (x, 0.0, z), (x, y, z), 0.022, "CS_Brass", sides=8)
            lathe(M, x, z, [(0, 0), (0.05, 0), (0.04, 0.03), (0, 0.035)], "CS_Gold", segs=10)


# ---------------------------------------------------------------------------------------------
# the painted light


def ring_pool(L):
    """The dome lamp's warm pool: brightest on the canvas's middle, spilling over the apron and a
    little onto the parquet round the ring."""
    g = L["ring"]
    cx, cz, cy = g["x"], g["z"], g["canvas"]
    warm = lin("#FFC98A")

    def fn(gx, gy, gz, rgb):
        d = math.hypot(gx - cx, gz - cz)
        if gy > cy + 1.6 or d > 6.5:
            return None
        if abs(gy - cy) < 0.03 or gy > cy:
            k = 0.55 * math.exp(-(d * d) / 9.0)
        elif gy < 0.02:
            k = 0.3 * math.exp(-((d - 3.2) ** 2) / 3.0) if d > 3.3 else 0.0
        else:
            k = 0.12 * math.exp(-(d * d) / 16.0)
        if k < 0.003:
            return None
        return (rgb[0] * (1 + k) + warm[0] * 0.04 * k, rgb[1] * (1 + k) + warm[1] * 0.04 * k, rgb[2] * (1 + k) + warm[2] * 0.04 * k)

    return fn


def neon_glow(L):
    n = L["neon"]
    face = wall_face(L)
    yellow = lin("#FFD23F")

    def fn(gx, gy, gz, rgb):
        if gz - face > 0.2 or abs(gx - n["x"]) > 3.6 or abs(gy - n["y"]) > 1.4:
            return None
        du = max(0.0, abs(gx - n["x"]) - 2.2)
        dv = max(0.0, abs(gy - n["y"]) - 0.3)
        k = 0.9 * math.exp(-(du * du + dv * dv) / 0.18)
        if k < 0.004:
            return None
        return (rgb[0] + yellow[0] * 0.35 * k, rgb[1] + yellow[1] * 0.3 * k, rgb[2] + yellow[2] * 0.1 * k)

    return fn


def trophy_light(L):
    t = L["trophy"]
    face = wall_face(L)

    def fn(gx, gy, gz, rgb):
        if abs(gx - t["x"]) > t["w"] / 2 + 0.2 or gz > face + t["d"] + 0.2 or gy < 0.8 or gy > t["h"]:
            return None
        k = 0.7 * math.exp(-((t["h"] - 0.2 - gy) ** 2) / 0.5)
        return (rgb[0] * (1 + k), rgb[1] * (1 + k * 0.9), rgb[2] * (1 + k * 0.7))

    return fn


# ---------------------------------------------------------------------------------------------
# the gloves


def glove(name, side, colour, dark, stripes, coll):
    """A boxing glove at the hand (origin), knuckles down the arm (-y), the thumb on the inner side
    (toward the body: +x for the right hand, -x for the left), the cuff up the wrist."""
    G = Mesh()
    inner = 1 if side == "R" else -1
    first = len(G.bm.faces)
    blob(G, 0.0, -0.035, 0.012, 0.074, 0.088, 0.08, colour, cuts=4, n=2.4)
    blob(G, inner * 0.058, -0.01, 0.045, 0.03, 0.048, 0.032, colour, cuts=2)
    if stripes:
        # the tiger's stripes: bands across the mitt, painted by where each face sits
        G.bm.faces.ensure_lookup_table()
        for f in G.bm.faces[first:]:
            c = f.calc_center_median()
            gx, gy, gz = c.x, c.z, -c.y
            ang = math.atan2(gz - 0.012, gx)
            if math.sin(gy * 55 + ang * 2.2) > 0.55:
                f.material_index = G.m(dark)
    lathe(G, 0.0, 0.004, [(0, 0.03), (0.062, 0.03), (0.066, 0.05), (0.064, 0.1), (0.058, 0.115), (0, 0.115)], "BX_GloveWhite" if stripes else dark, segs=16)
    lathe(G, 0.0, 0.004, [(0, 0.06), (0.068, 0.06), (0.068, 0.078), (0, 0.078)], dark if not stripes else "BX_TigerBlack", segs=16)
    # the laces up the inside of the cuff
    for k in range(3):
        blob(G, inner * 0.064, 0.045 + k * 0.022, 0.004, 0.006, 0.005, 0.02, "BX_GloveWhite", cuts=1)
    return make_object(name, G, coll, origin=(0.0, 0.0, 0.0), force="CS_Sheen")


def build_gloves(root):
    old = bpy.data.collections.get(GLOVES)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(GLOVES)
    bpy.context.scene.collection.children.link(coll)
    for side in ("L", "R"):
        glove(f"Glove_red_{side}", side, "BX_GloveRed", "BX_GloveRedDark", False, coll)
        glove(f"Glove_blue_{side}", side, "BX_GloveBlue", "BX_GloveBlueDark", False, coll)
        glove(f"Glove_tiger_{side}", side, "BX_TigerOrange", "BX_TigerBlack", True, coll)
    return coll


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    L = read_ring_layout(root)
    cushions = read_ring_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    M = Mesh()
    M.lit = True
    nodes = []
    LIGHTS.clear()
    LIGHTS.extend([ring_pool(L), neon_glow(L), trophy_light(L)])
    wall_features(L)
    build_floor(M, L)
    build_walls(M, L)
    build_ring(M, L, nodes)
    build_lamp(M, L)
    build_bell_table(M, L, cushions)
    build_ringside(M, L, cushions)
    build_lounge(M, L, cushions)
    build_gym(M, L, cushions, nodes)
    build_shop(M, L)
    build_trophy(M, L)
    build_rail(M, L)
    make_object("BoxingRing_Static", M, coll)
    nodes.append(chalk_slate(L))
    for n in nodes:
        make_object(n["name"], n["mesh"], coll, origin=n["origin"], force=n.get("force"), recalc=n.get("recalc", True), coloured=n.get("coloured", True))
    return coll, L


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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "verts": len(o.data.vertices), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": [m.name for m in o.data.materials]}
    return {"objects": out, "checks": {"drawCalls": sum(len(v["materials"]) for v in out.values()), "tris": sum(v["tris"] for v in out.values())}}


def main_ring():
    report = globals().get("REPORT_PATH")
    try:
        root = _root()
        studio(root, "begin")
        coll, L = build(root)
        out = os.path.join(root, "client", "public", "models", "boxing_ring.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        gloves = build_gloves(root)
        gout = os.path.join(root, "client", "public", "models", "boxing_gloves.glb")
        export(gloves, gout)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "gloves": {"bytes": os.path.getsize(gout), **summary(gloves)}, **summary(coll)}
        result["studio"] = studio(root, "finish", [coll, gloves])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1)[:6000])
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main_ring()
