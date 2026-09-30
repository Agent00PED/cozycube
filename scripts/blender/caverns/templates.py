"""The templates the game instances: the fauna (`build_fauna_templates`: the crab, the swiftlet, the
bat) and each ore node's rock, its own mineral on its host rock (`ore_coal`, `ore_copper`,
`ore_iron`, `ore_silver`, `ore_glimmer`, `ore_rockfall`; their glints set on the rock's own skin by
`surface_point`), with the broken node's stump (`build_ores`)."""

import math
import random

from mathutils import Vector
from .kit import (
    angular, blob, broken_slab, chunk, cyl, fbm, game_point, hullbox, lump, Mesh, mixc, prism,
    smooth, turned, W,
)
from .scene import finish_object


# ---------------------------------------------------------------------------------------------
# the templates the game instances: the fauna and the ore nodes' rocks


def build_fauna_templates(coll):
    """The glowing cave crab and the swiftlet, at the origin (drawn instanced, never here)."""
    crab = Mesh("CV_Glow")
    blob(crab, 0.0, 0.035, 0.0, 0.07, 0.028, 0.055, "crabShell", cuts=1)
    blob(crab, 0.0, 0.058, 0.0, 0.045, 0.012, 0.035, "crabGlow", cuts=1)
    for sx in (-1, 1):
        blob(crab, sx * 0.07, 0.04, 0.055, 0.028, 0.018, 0.022, "crabGlow", cuts=0)
        for k in range(3):
            cyl(crab, (sx * 0.05, 0.03, -0.02 + 0.025 * k), (sx * 0.11, 0.0, -0.04 + 0.035 * k), 0.007, "crabShell", sides=3, cap=False)
        cyl(crab, (sx * 0.02, 0.05, 0.04), (sx * 0.025, 0.08, 0.05), 0.005, "crabGlow", sides=3)
    for f in crab.bm.faces:
        crab.setsmooth(f)
    swift = Mesh("CV_Fauna")
    blob(swift, 0.0, 0.0, 0.0, 0.035, 0.03, 0.09, "swift", cuts=1)
    blob(swift, 0.0, -0.012, 0.01, 0.025, 0.018, 0.06, "swiftBelly", cuts=0)
    for sx in (-1, 1):
        wing = [swift.v(sx * 0.02, 0.005, 0.03), swift.v(sx * 0.24, 0.0, -0.02), swift.v(sx * 0.2, 0.0, -0.07), swift.v(sx * 0.02, 0.005, -0.03)]
        swift.face(wing if sx > 0 else list(reversed(wing)), "swift")
        wing2 = [swift.v(sx * 0.02, 0.002, 0.03), swift.v(sx * 0.02, 0.002, -0.03), swift.v(sx * 0.2, -0.003, -0.07), swift.v(sx * 0.24, -0.003, -0.02)]
        swift.face(wing2 if sx > 0 else list(reversed(wing2)), "swiftBelly")
    swift.face([swift.v(0.0, 0.0, -0.08), swift.v(0.05, 0.0, -0.16), swift.v(0.0, 0.0, -0.12), swift.v(-0.05, 0.0, -0.16)], "swift")
    # the bat: a dark body, ears, membranous wings scalloped between their fingers (|x| over 0.02: the
    # wing, beaten in the game's vertex shader as the swift's are)
    bat = Mesh("CV_Fauna")
    blob(bat, 0.0, 0.0, 0.0, 0.03, 0.028, 0.06, "batBody", cuts=1)
    for sx in (-1, 1):
        cyl(bat, (sx * 0.012, 0.02, 0.045), (sx * 0.02, 0.05, 0.05), 0.009, "batBody", sides=3, r_end=0.001)
        pts = [(sx * 0.02, 0.004, 0.035), (sx * 0.12, 0.01, 0.05), (sx * 0.2, 0.0, 0.02), (sx * 0.17, 0.0, -0.02), (sx * 0.12, 0.0, -0.01), (sx * 0.08, 0.0, -0.04), (sx * 0.02, 0.004, -0.03)]
        for tri in ((0, 1, 6), (1, 5, 6), (1, 4, 5), (1, 2, 4), (2, 3, 4)):
            q = [bat.v(*pts[i]) for i in tri]
            bat.face(q if sx > 0 else list(reversed(q)), "batWing")
    # a page of Old Flint's journal: a torn sheet of parchment weighted down by a pebble, its corner curled
    page = Mesh("CV_Fauna")
    outline = [(-0.16, -0.11), (-0.05, -0.125), (0.06, -0.105), (0.155, -0.12), (0.165, -0.02), (0.15, 0.1), (0.04, 0.118), (-0.07, 0.1), (-0.15, 0.115), (-0.165, 0.02)]
    top = [page.v(x, 0.012 + (0.03 if x > 0.13 and z > 0.08 else 0.0), z) for x, z in outline]
    page.face(list(reversed(top)), "mapPaper")
    for k in range(4):
        z = -0.07 + 0.045 * k
        cyl(page, (-0.11, 0.014, z), (0.1 - 0.04 * (k % 2), 0.014, z), 0.004, "mapInk", sides=3, cap=False)
    blob(page, 0.06, 0.035, -0.04, 0.045, 0.03, 0.04, "pebble", cuts=1)
    finish_object("Find_Page", page, coll, bake=False)
    finish_object("Fauna_Crab", crab, coll, bake=False)
    finish_object("Fauna_Swift", swift, coll, bake=False)
    finish_object("Fauna_Bat", bat, coll, bake=False)


def surface_point(tree, centre, d):
    """Where a ray from the rock's centre along the game direction `d` meets its skin (a BVH over the
    rock as built): the point and its outward normal, in the game's coordinates (None: a miss)."""
    hit = tree.ray_cast(W(*centre), W(*d).normalized(), 5.0)
    if hit[0] is None:
        return None
    p = game_point(hit[0])
    n = hit[1]
    return p, (n.x, n.z, -n.y)


def face_dirs(rng, n, front=0.8, up=0.5):
    """Directions out of a rock, most of them toward its face (+z, the miner) and its top."""
    out = []
    for _ in range(n):
        d = Vector((rng.uniform(-1, 1), rng.uniform(-0.4, 1), rng.uniform(-1, 1)))
        d.z += front
        d.y += up
        out.append(tuple(d.normalized()))
    return out


def ore_coal(rock, glow, r, rng):
    """A coal outcrop: a boulder of black coal, its thin shale partings grey across it, glossy
    faceted lumps of coal bursting out of its face and top, a heap of loose lumps at its foot, and
    the anthracite's blue glints where the light catches it (black against the breakdown's pale
    limestone: coal at a glance)."""
    def paint(x, y, z, up):
        n1 = fbm(x * 5.0, y * 5.0, z * 5.0, 41)
        parting = abs(math.sin(y / r * 7.5 + 0.35 * x / r + n1 * 1.2)) < 0.16
        if parting:
            return mixc("coalRock", "shale", 0.35)
        return "coalFacet" if up > 0.55 else ("coalSheen" if up > -0.1 else "coalBlack")
    lump(rock, 0.0, 0.0, 0.0, r * 1.02, r * 1.45, r * 0.92, rng, paint, subdiv=2, rough=0.3, sink=0.1)
    from mathutils.bvhtree import BVHTree
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    hits = [h for h in (surface_point(tree, (0.0, 0.62 * r, 0.0), d) for d in face_dirs(rng, 8, front=0.7, up=0.6)) if h]
    for k, ((x, y, z), n) in enumerate(hits):
        # (a lump of coal broken out of the face: flat glossy facets)
        q = 0.07 + 0.05 * rng.random()
        angular(rock, x + n[0] * q * 0.3, y + n[1] * q * 0.3 - q * 0.4, z + n[2] * q * 0.3, q, q * 1.5, rng, "coalFacet", "coalBlack", sink=0.0, npts=8)
    for k in range(6):
        a = 0.2 + math.pi * 1.1 * k / 5 + rng.random() * 0.3
        rr = r * (1.0 + 0.2 * rng.random())
        q = 0.06 + 0.05 * rng.random()
        angular(rock, math.cos(a) * rr, 0.0, math.sin(a) * rr * 0.9, q, q * 1.3, rng, "coalFacet", "coalBlack", sink=0.02, npts=7)
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    for d in face_dirs(rng, 12, front=1.0, up=0.5):
        hit = surface_point(tree, (0.0, 0.6 * r, 0.0), d)
        if hit:
            (x, y, z), n = hit
            blob(glow, x + n[0] * 0.01, y + n[1] * 0.01, z + n[2] * 0.01, 0.016, 0.016, 0.016, "anthracite", cuts=0)


def ore_copper(rock, glow, r, rng):
    """A copper vein: a block of the jungle's limestone crusted green and blue-green with verdigris,
    nuggets of native copper bulging out of its face."""
    def paint(x, y, z, up):
        n1 = fbm(x * 6.0, y * 6.0, z * 6.0, 91)
        c = mixc("limestoneDark", "limestone", 0.35 + 0.4 * (0.5 + 0.5 * n1))
        crust = smooth(-0.1, 0.45, fbm(x * 4.0, y * 4.0, z * 4.0, 93)) * (0.45 + 0.55 * smooth(-0.3, 0.5, up + z / r * 0.6))
        return mixc(c, mixc("malachite", "azurite", 0.5 + 0.5 * n1), min(1.0, crust * 1.05))
    lump(rock, 0.0, 0.0, 0.0, r * 1.0, r * 1.75, r * 0.9, rng, paint, subdiv=2, rough=0.24, sink=0.12)
    from mathutils.bvhtree import BVHTree
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    centre = (0.0, 0.72 * r, 0.0)
    nuggets = []
    for d in face_dirs(rng, 9, front=0.55, up=0.15):
        hit = surface_point(tree, centre, d)
        if hit:
            nuggets.append(hit)
    for k, ((x, y, z), n) in enumerate(nuggets):
        s = 0.06 + 0.05 * rng.random()
        # (a faceted chunk of native copper, standing out of the crust along its face)
        prism(rock, (x - n[0] * 0.02, y - n[1] * 0.02, z - n[2] * 0.02), (n[0] + 0.3 * (rng.random() - 0.5), n[1] + 0.4, n[2] + 0.3 * (rng.random() - 0.5)), s, s * 1.6, "copperNug" if k % 3 else "copperDark", sides=5, tip=0.55)
        if k % 2 == 0:
            blob(glow, x + n[0] * s * 1.3, y + n[1] * s * 1.3 + s * 0.8, z + n[2] * s * 1.3, 0.018, 0.018, 0.018, "copperGlow", cuts=0)


def ore_iron(rock, glow, r, rng):
    """An iron lode: a squat boulder of banded iron, gunmetal hematite striped with red jasper in
    tilted beds, rust bleeding round its foot, plates of metallic specularite standing out of its
    face and catching the light (dark and cool against the mudflats' orange: iron at a glance)."""
    def paint(x, y, z, up):
        n1 = fbm(x * 4.0, y * 4.0, z * 4.0, 57)
        if y < 0.1 * r:
            return "rustDark" if n1 > 0.0 else "rust"
        if abs(math.sin((y + 0.35 * x - 0.2 * z) / r * 9.0 + n1 * 1.5)) < 0.24:
            return "ironBand"
        return "ironMetal" if up > 0.6 and n1 > 0.2 else "ironDark"
    lump(rock, 0.0, 0.0, 0.0, r * 1.08, r * 1.2, r * 0.96, rng, paint, subdiv=2, rough=0.26, sink=0.1)
    from mathutils.bvhtree import BVHTree
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    hits = [h for h in (surface_point(tree, (0.0, 0.5 * r, 0.0), d) for d in face_dirs(rng, 8, front=0.9, up=0.5)) if h]
    for k, ((x, y, z), n) in enumerate(hits):
        # (a plate of specular hematite: a thin, flat, metallic flake out of the face)
        q = 0.09 + 0.05 * rng.random()
        yaw = math.atan2(n[0], n[2]) + (rng.random() - 0.5) * 0.8
        hullbox(rock, (x + n[0] * q * 0.25, y + n[1] * q * 0.25, z + n[2] * q * 0.25), turned(yaw, roll=0.3 * (rng.random() - 0.5), pitch=0.5 * (rng.random() - 0.5)), q, q * 0.9, q * 0.18, "ironMetal", "hematiteSheen")
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    for d in face_dirs(rng, 8, front=0.9, up=0.8):
        hit = surface_point(tree, (0.0, 0.5 * r, 0.0), d)
        if hit:
            (x, y, z), n = hit
            blob(glow, x + n[0] * 0.012, y + n[1] * 0.012, z + n[2] * 0.012, 0.016, 0.016, 0.016, "ironGlint", cuts=0)


def ore_silver(rock, glow, r, rng):
    """A silver seam: a block of dark blue-grey argentite veined with white calcite, dog-tooth
    calcite crystals out of its top, native silver threading over its face in curling wires and
    bright nuggets that shine (dark against the terraces' white travertine: silver at a glance)."""
    def paint(x, y, z, up):
        n1 = fbm(x * 5.0, y * 5.0, z * 5.0, 63)
        vein = abs(math.sin((x * 0.8 + y * 0.6 - z * 0.5) / r * 4.0 + n1 * 2.0)) < 0.13
        if vein:
            return "calciteLight"
        return "silverHost" if up > 0.3 else "silverHostDark"
    lump(rock, 0.0, 0.0, 0.0, r * 1.0, r * 1.3, r * 0.9, rng, paint, subdiv=2, rough=0.28, sink=0.1)
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.random() * 0.5
        prism(rock, (math.cos(a) * r * 0.3, r * 1.0, math.sin(a) * r * 0.26), (math.cos(a) * 0.4, 1.0, math.sin(a) * 0.4), 0.04 + 0.025 * rng.random(), 0.16 + 0.12 * rng.random(), "calciteLight", sides=5, tip=0.5)
    from mathutils.bvhtree import BVHTree
    rock.bm.normal_update()
    tree = BVHTree.FromBMesh(rock.bm)
    centre = (0.0, 0.62 * r, 0.0)
    for w in range(6):
        d = Vector(face_dirs(rng, 1, front=1.1, up=0.3)[0])
        pts = []
        for j in range(9):
            hit = surface_point(tree, centre, tuple(d))
            if not hit:
                break
            (x, y, z), n = hit
            pts.append((x + n[0] * 0.014, y + n[1] * 0.014, z + n[2] * 0.014))
            d = (d + Vector((rng.uniform(-0.28, 0.28), rng.uniform(-0.25, 0.3), rng.uniform(-0.28, 0.28)))).normalized()
        for a, b in zip(pts, pts[1:]):
            cyl(glow, a, b, 0.017, "silverVein", sides=4)
        # (a twig or two off each wire, and a nugget where it starts)
        for a in pts[2:-1:3]:
            tip = (a[0] + rng.uniform(-0.07, 0.07), a[1] + rng.uniform(0.0, 0.08), a[2] + rng.uniform(-0.02, 0.07))
            cyl(glow, a, tip, 0.01, "silverVein", sides=3)
        if pts:
            blob(glow, pts[0][0], pts[0][1], pts[0][2], 0.04, 0.035, 0.04, "silverNugget", cuts=1, n=1.6)


def ore_glimmer(rock, glow, r, rng):
    """A glimmerstone cluster: a great crystal out of a dark socket of rock, a crown of lesser ones
    round it leaning out, cyan and amethyst, all of them glowing from within."""
    for f in chunk(rock, r * 0.9, r * 0.55, rng, sink=0.1, squash=0.9, npts=18):
        f.normal_update()
        rock.setf(f, "glimmerBase" if f.normal.z > 0.3 else "tunnel")
    prism(glow, (0.0, r * 0.3, 0.0), (0.08, 1.0, 0.12), 0.13, r * 1.7, "cyan", sides=6, tip=0.3)
    for k in range(10):
        a = 2 * math.pi * k / 10 + rng.random() * 0.4
        lean = 0.35 + 0.5 * rng.random()
        big = k % 3 == 0
        colr = ("violet" if k % 4 == 1 else "cyan") + ("" if big else "Soft")
        prism(glow, (math.cos(a) * r * 0.32, r * 0.28, math.sin(a) * r * 0.3), (math.cos(a) * lean, 1.0, math.sin(a) * lean), (0.07 if big else 0.045) + 0.02 * rng.random(), r * (1.0 if big else 0.6) * (0.7 + 0.5 * rng.random()), colr, sides=5)
    for k in range(6):
        a = rng.random() * 6.283
        prism(glow, (math.cos(a) * r * 0.7, 0.05, math.sin(a) * r * 0.62), (math.cos(a) * 0.9, 0.6, math.sin(a) * 0.9), 0.03, 0.12 + 0.1 * rng.random(), "cyanSoft" if k % 2 else "violetSoft", sides=4)


def ore_rockfall(rock, glow, r, rng):
    """A Rockfall's heap (a living wonder: shared/caverns_codex.ts): slabs fresh off the breakdown's
    roof piled on one another, pale where they broke, with coal, copper and banded iron showing in
    them and loose lumps of each round its foot."""
    for k, (x, y, z, hx, hy, hz, yaw) in enumerate((
        (0.0, 0.22, 0.0, 0.55, 0.2, 0.42, 0.3),
        (0.28, 0.5, -0.12, 0.38, 0.16, 0.3, -0.5),
        (-0.3, 0.42, 0.14, 0.34, 0.15, 0.28, 1.1),
        (0.05, 0.72, 0.05, 0.28, 0.12, 0.22, 0.2),
        (0.46, 0.16, 0.36, 0.26, 0.14, 0.2, 0.8),
    )):
        broken_slab(rock, (x * r / 0.8, y * r / 0.8, z * r / 0.8), turned(yaw, roll=0.12 * (k % 3 - 1), pitch=0.1 * ((k + 1) % 3 - 1)), hx * r / 0.8, hy * r / 0.8, hz * r / 0.8, rng, top="shale", side="coalRock", under="limestoneDark")
    for k in range(15):
        a = rng.random() * 6.283
        rr = r * (0.35 + 0.75 * rng.random())
        y = 0.05 + 0.7 * rng.random() * (1.0 - rr / (1.3 * r))
        q = 0.08 + 0.07 * rng.random()
        kind = k % 3
        if kind == 0:
            angular(rock, math.cos(a) * rr, max(0.0, y), math.sin(a) * rr, q, q * 1.3, rng, "coalFacet", "coalBlack", sink=0.02, npts=6)
        elif kind == 1:
            blob(glow, math.cos(a) * rr, max(0.03, y), math.sin(a) * rr, q * 0.8, q * 0.6, q * 0.7, "copperNug", cuts=0, n=1.6)
        else:
            angular(rock, math.cos(a) * rr, max(0.0, y), math.sin(a) * rr, q, q * 1.1, rng, "ironBand", "ironDark", sink=0.02, npts=6)


def ore_rock(kind, r, coll):
    rock = Mesh("CV_OreRock")
    glow = Mesh("CV_OreGlow")
    rng = random.Random(sum(ord(c) for c in kind) * 97)
    if kind == "monolith":
        # a tall obelisk of dark stone, bevelled, cracked with violet runes
        h = 2.6
        levels = 7
        for k in range(levels):
            y0 = h * k / levels - (0.12 if k == 0 else 0.0)
            y1 = h * (k + 1) / levels
            w0 = 0.62 - 0.22 * (k / levels)
            w1 = 0.62 - 0.22 * ((k + 1) / levels)
            twist = 0.06 * k
            ring0 = [(w0 * math.cos(twist + math.pi / 4 + math.pi / 2 * i), w0 * 0.8 * math.sin(twist + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
            ring1 = [(w1 * math.cos(twist + 0.06 + math.pi / 4 + math.pi / 2 * i), w1 * 0.8 * math.sin(twist + 0.06 + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
            lo = [rock.v(x, y0, z) for x, z in ring0]
            hi = [rock.v(x, y1, z) for x, z in ring1]
            for i in range(4):
                j = (i + 1) % 4
                rock.face((lo[i], lo[j], hi[j], hi[i]), "monolith" if (i + k) % 2 else "monolithEdge")
        top = [(0.4 * math.cos(0.42 + math.pi / 4 + math.pi / 2 * i), 0.32 * math.sin(0.42 + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
        apex = rock.v(0.03, h + 0.5, 0.0)
        tv = [rock.v(x, h, z) for x, z in top]
        for i in range(4):
            rock.face((tv[i], tv[(i + 1) % 4], apex), "monolithEdge")
        for k in range(14):
            y = 0.2 + 2.3 * rng.random()
            a = rng.random() * 6.283
            w = 0.62 - 0.22 * (y / h)
            blob(glow, 0.8 * w * math.cos(a), y, 0.66 * w * math.sin(a), 0.05, 0.16 + 0.1 * rng.random(), 0.05, "runeGlow", cuts=1)
    else:
        {"coal": ore_coal, "copper": ore_copper, "iron": ore_iron, "silver": ore_silver, "glimmer": ore_glimmer, "rockfall": ore_rockfall}[kind](rock, glow, r, rng)
    ob_r = finish_object(f"Ore_{kind}", rock, coll, bake=False, mottle=0.1)
    ob_g = finish_object(f"Ore_{kind}_Glow", glow, coll, bake=False)
    ob_g.parent = ob_r
    return ob_r


def build_ores(coll, radii):
    made = [ore_rock(kind, radii[kind], coll) for kind in ("coal", "copper", "iron", "silver", "glimmer", "monolith", "rockfall")]
    # a broken node's stump: dark, rough, fractured bedrock, a few shards round it
    rubble = Mesh("CV_OreRock")
    rng = random.Random(99)
    for f in chunk(rubble, 0.36, 0.26, rng, sink=0.1, squash=0.85):
        rubble.setf(f, "rubble")
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.random() * 0.4
        blob(rubble, 0.16 * math.cos(a), 0.17, 0.14 * math.sin(a), 0.1, 0.02, 0.018, "rubbleCrack", cuts=0)
    for k in range(6):
        a = rng.random() * 6.283
        rr = 0.34 + 0.18 * rng.random()
        blob(rubble, rr * math.cos(a), 0.03, rr * math.sin(a), 0.07 + 0.05 * rng.random(), 0.04 + 0.03 * rng.random(), 0.06 + 0.04 * rng.random(), "rubble", cuts=0, noise=0.2, seed=k, bottom=-0.02)
    made.append(finish_object("Ore_Rubble", rubble, coll, bake=False, mottle=0.12))
    return made
