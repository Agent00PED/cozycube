"""The Whispering Woods diorama: builds client/public/models/forest.glb, and the felling trees'
looks in client/public/models/trees.glb (the campfire's Soft Pines use them too).

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_forest.py

Nothing is placed by hand: where everything stands comes from FOREST_LAYOUT in
shared/worlds/forest.ts (the JSON between its layout markers, read as is). A stylised clay island
like the Campfire's, every material opaque and matte (the water a little glossier), the same
night-and-day friendly palette. Nodes:

    Forest_Ground       the floating island: grass on top, soil down its bevelled sides, the river's
                        channel carved along its meandering spline (a dark bed, stone walls), out
                        through the island's north and east edges
    Forest_Underside    the rock beneath, tapering away
    Forest_Meadow       the island's top as a fine grid, its grass coloured vertex by vertex: the
                        Birch Grove's pale grass, the Cedar Ridge's stony turf, the Golden Glen's
                        fallen gold and the Shrine's moss blend into one another along wandering,
                        organic edges (no rectangles), the colour easing back to the base grass at
                        the river's banks and the island's rim (FW_Meadow: one vertex-colour material)
    Forest_Banks        damp dark earth along both banks of the river
    Forest_Floors       the Shrine's flagstones round the elderwood
    Forest_Paths        the dirt trails from the archway through the wood
    Forest_Deco         grass tufts, ferns, wildflowers, mushrooms and leaf piles
    Forest_Rocks        the river's rocks, the bank stones and the pebbles at its water line, the
                        ridge's boulders, the shrine's ring of standing stones (their runes glowing
                        faintly)
    Forest_Vista        twenty-five tall pines along the back and side edges (never felled)
    Forest_Structures   the branch archway back to the campfire, the old mine adit down to the
                        Glimmering Caverns (a mossy outcrop on the western cliff behind the Autumn
                        Maples: a timber-framed portal onto the dark, vines over its lintel, bushes
                        crowding it, a lantern, the old rails running out), Bramble's log cabin (flush with the
                        eastern tree line: warm windows, a stone chimney), his store counter and
                        hanging sign, the advanced workbench right beside the counter (worked from
                        the trail side),
                        the river's fishing spots (a flat stone out over the water, a raw log and a
                        boulder to sit on, each with a little fish sign)
    Forest_Water        the river's water surface along the spline, spilling over the island's edge
                        at both ends (the game runs it through a flowing shader), and the white
                        foam round the rocks, along the banks and at the spills (FW_Foam)

trees.glb (its own file, Forest_Trees):
    Tree_<kind>_<stage> the felling trees' looks, each at the origin, its pivot at the trunk's foot
                        (the game places one per node, instanced, each at its own size, and swings a
                        mature one down when it falls): kind soft_pine, birch, cedar, maple,
                        elderwood; stage stump, sprout, sapling, mature
    Fauna_Bird_Body     a little songbird (robin-breasted: the game tints each one), its wings
    Fauna_Bird_WingL/R  apart (each node's origin is its shoulder: the game flaps them), all at the
                        origin: the game instances them on the vista pines' lower boughs
    Fauna_Butterfly_*   a butterfly the same way (Body, WingL, WingR), pale wings the game tints
    Animal_Deer         the deer by the Golden Glen's path (Animal_Deer_Head: pivots at the neck,
                        she grazes and looks up)
    Animal_Rabbit_1..3  three rabbits by the Border's splitting block (they hop)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
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

COLLECTION = "Forest"

PALETTE = {
    "FW_Grass": "#6F9A55",
    "FW_Soil": "#3A2D25",
    "FW_SoilDeep": "#2A211C",
    "FW_Bed": "#2E4A52",
    "FW_Stone": "#8E8C88",
    "FW_StoneDark": "#6D6A66",
    "FW_Moss": "#4E7A4A",
    "FW_BirchFloor": "#8FAE6B",
    "FW_RidgeFloor": "#7F8C68",
    "FW_GlenFloor": "#C98B3A",
    "FW_ShrineFloor": "#3F6B4A",
    "FW_Dirt": "#8B6B4C",
    "FW_Bank": "#4C5A36",
    "FW_Pebble": "#A39C90",
    "FW_Tuft": "#5E8A48",
    "FW_Fern": "#3F7446",
    "FW_Petal": "#F2B8C6",
    "FW_PetalYellow": "#F4D35E",
    "FW_PetalBlue": "#9EB8E8",
    "FW_MushCap": "#C9523F",
    "FW_MushStem": "#EFE3CF",
    "FW_LeafPile": "#D9713A",
    "FW_Water": "#4A89A6",
    "FW_Foam": "#E6F2F2",
    "FW_Rune": "#8FF0D8",
    # wood and the cabin
    "FW_Bark": "#5E4230",
    "FW_Log": "#7A5536",
    "FW_WoodCut": "#D2A774",
    "FW_Plank": "#9C7148",
    "FW_PlankDark": "#7C5838",
    "FW_Roof": "#6B3B2A",
    "FW_Window": "#FFC873",
    "FW_Iron": "#34302D",
    "FW_Rope": "#CDB48A",
    "FW_Honey": "#E8A93A",
    "FW_Cloth": "#E9DDC4",
    "FW_Red": "#C2463A",
    "FW_MossDeep": "#3E6B3E",
    # the places (docs/maps-fill-plan.md part 3)
    "FW_Canvas": "#D9CDB0",
    "FW_Hive": "#E3C36B",
    "FW_Leafy": "#5E9A4E",
    "FW_Pumpkin": "#E08A2E",
    "FW_Net": "#B9B39A",
    "FW_Ash": "#4A4440",
    # the trees
    "FW_PineBark": "#5E4230",
    "FW_PineNeedle": "#2E5A46",
    "FW_PineNeedleLight": "#3B6E53",
    "FW_BirchBark": "#ECE8DC",
    "FW_BirchMark": "#3A3531",
    "FW_BirchLeaf": "#A8C66C",
    "FW_BirchLeafLight": "#C9DB86",
    "FW_CedarBark": "#8A4E32",
    "FW_CedarNeedle": "#3E6E5E",
    "FW_CedarNeedleLight": "#5A8C72",
    "FW_MapleBark": "#5B4033",
    "FW_MapleLeaf": "#E0782E",
    "FW_MapleLeafGold": "#F2B33D",
    "FW_MapleLeafRed": "#C8452F",
    "FW_ElderBark": "#4A3F4F",
    "FW_ElderLeaf": "#4FA69A",
    "FW_ElderLeafGlow": "#9FF2E0",
    "FW_Wisp": "#FFF1B8",
    # the animals
    "FW_DeerFur": "#A8703F",
    "FW_DeerCream": "#EBD9BC",
    "FW_DeerDark": "#4A3222",
    "FW_Antler": "#D9C7A0",
    "FW_Eye": "#1E1B1A",
    "FW_RabbitFur": "#CBB8A0",
    "FW_RabbitWhite": "#F2EEE6",
    "FW_Pink": "#E9A0A0",
}
ROUGHNESS = {"FW_Water": 0.25, "FW_Iron": 0.6, "FW_Window": 0.5, "FW_Honey": 0.45, "FW_Eye": 0.35}
EMISSION = {"FW_Window": 2.4, "FW_Rune": 1.8, "FW_ElderLeafGlow": 1.6, "FW_Wisp": 3.0}
DOUBLE_SIDED = {"FW_Fern", "FW_Petal", "FW_PetalYellow", "FW_PetalBlue", "FW_Foam", "FW_Cloth", "FW_Canvas", "FW_Net"}

LAYER_MEADOW = 0.004
LAYER_FLOOR = 0.008
LAYER_BANK = 0.012
LAYER_PATH = 0.016
# the meadow's biomes (each zone's `floor`), blended by vertex colour
BIOME = {"meadow": "#6F9A55", "birch": "#8FAE6B", "ridge": "#7F8C68", "glen": "#B48A46", "shrine": "#3F6B4A", "needles": "#566F47"}
TREE_KINDS = ("soft_pine", "birch", "cedar", "maple", "elderwood")
STAGES = ("stump", "sprout", "sapling", "mature")


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def W(x, y, z):
    """The game's (x, y up, z) as a Blender point."""
    return Vector((x, -z, y))


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_forest.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_cushions(root):
    """The seats' cushions (shared/seats.ts): the fishing log's and boulder's tops are the game's."""
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = {}
    for name in ("log", "boulder", "picnicBench", "dock", "swing"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "forest.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


# ---------------------------------------------------------------------------------------------
# shapes


def catmull(p0, p1, p2, p3, u):
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u)


def path_polyline(path, step=0.1):
    P = [(p[0], p[1], p[2] if len(p) > 2 else 1.2) for p in path["points"]]
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


# --- the river: the same Catmull-Rom spline as shared/worlds/forest.ts forestRiver ([x, z,
# halfWidth] points, in off the north edge and out off the east) ---
RIVER_FRAMES = {}


def river_samples(L, per=10):
    P = L["river"]["points"]
    at = lambda k: P[max(0, min(len(P) - 1, k))]
    out = []
    for i in range(len(P) - 1):
        for k in range(per):
            u = k / per
            out.append(tuple(catmull(at(i - 1)[d], at(i)[d], at(i + 1)[d], at(i + 2)[d], u) for d in range(3)))
    out.append(tuple(P[-1]))
    return out


def river_frame(L, per=10):
    """Each sample of the river: its centre (x, z), half-width, tangent (tx, tz) and left normal."""
    if per not in RIVER_FRAMES:
        S = river_samples(L, per)
        out = []
        for i, (x, z, w) in enumerate(S):
            ax, az = S[max(0, i - 1)][:2]
            bx, bz = S[min(len(S) - 1, i + 1)][:2]
            tx, tz = bx - ax, bz - az
            d = math.hypot(tx, tz) or 1
            tx, tz = tx / d, tz / d
            out.append((x, z, w, tx, tz, -tz, tx))
        RIVER_FRAMES[per] = out
    return RIVER_FRAMES[per]


def river_dist(L, x, z):
    """How far (x, z) is from the river's centre line, and the river's half-width there."""
    F = river_frame(L, 12)
    best = (1e9, 1.0)
    for (ax, az, aw, *_), (bx, bz, bw, *_) in zip(F, F[1:]):
        dx, dz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
        d = math.hypot(x - (ax + dx * t), z - (az + dz * t))
        if d < best[0]:
            best = (d, aw + (bw - aw) * t)
    return best


BROOK_FRAMES = {}


def brook_frame(L, per=8):
    """Each sample of the brook (forest.ts `forestBrook`: the same spline): its centre (x, z), its
    bed's half-width, its tangent (tx, tz) and left normal."""
    if per not in BROOK_FRAMES:
        Pn = L["brook"]["points"]
        at = lambda k: Pn[max(0, min(len(Pn) - 1, k))]
        S = []
        for i in range(len(Pn) - 1):
            for k in range(per):
                S.append(tuple(catmull(at(i - 1)[d], at(i)[d], at(i + 1)[d], at(i + 2)[d], k / per) for d in range(3)))
        S.append(tuple(Pn[-1]))
        out = []
        for i, (x, z, w) in enumerate(S):
            ax, az = S[max(0, i - 1)][:2]
            bx, bz = S[min(len(S) - 1, i + 1)][:2]
            tx, tz = bx - ax, bz - az
            d = math.hypot(tx, tz) or 1
            out.append((x, z, w, tx / d, tz / d, -tz / d, tx / d))
        BROOK_FRAMES[per] = out
    return BROOK_FRAMES[per]


def brook_dist(L, x, z):
    """How far (x, z) is from the brook's centre line, and its bed's half-width there."""
    if "brook" not in L:
        return (1e9, 0.0)
    F = brook_frame(L, 8)
    best = (1e9, 0.0)
    for (ax, az, aw, *_), (bx, bz, bw, *_) in zip(F, F[1:]):
        dx, dz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
        d = math.hypot(x - (ax + dx * t), z - (az + dz * t))
        if d < best[0]:
            best = (d, aw + (bw - aw) * t)
    return best


def brook_open(L, x, z):
    """0 under the brook's log bridge (the ground is not cut there), 1 away from it."""
    b = L["brook"]["bridge"]
    return smooth(b["half"], b["half"] + 0.3, math.hypot(x - b["x"], z - b["z"]))


def in_rounded(x, z, a, r):
    """Inside the rounded square |x|, |z| <= a with corners of radius r."""
    ax, az = abs(x), abs(z)
    if ax > a or az > a:
        return False
    if ax > a - r and az > a - r:
        return math.hypot(ax - (a - r), az - (a - r)) <= r
    return True


def rim_dist(x, z, a, r):
    """How far inside the rounded square's edge (x, z) is."""
    ax, az = abs(x), abs(z)
    if ax > a - r and az > a - r:
        return r - math.hypot(ax - (a - r), az - (a - r))
    return a - max(ax, az)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def rounded_rect(x0, x1, z0, z1, r, per_corner=8):
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
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    faces = [bm.faces.new(list(reversed(lo))), bm.faces.new(hi)]
    faces[1].material_index = m if top_m is None else top_m
    faces[0].material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m
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
        bm.faces.new(ring).material_index = m if cap_m is None else cap_m


def lathe(bm, cx, cz, profile, segs=16, m=0, y0=0.0, yaw=0.0, jitter=0.0, rng=None):
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = []
    for r, h in profile[1:-1]:
        ring = []
        for k in range(segs):
            a = yaw + 2 * math.pi * k / segs
            rr = r * (1 + (jitter * (rng.random() - 0.5) if rng else 0))
            ring.append(bm.verts.new(W(cx + rr * math.cos(a), y0 + h, cz + rr * math.sin(a))))
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


def blob(bm, cx, cy, cz, hx, hy, hz, m=0, cuts=3, n=2.4, noise=0.0, rng=None, flat_bottom=None):
    """A rounded lump (a superellipsoid, roughened by `noise`), centred at the game point."""
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


def hexa(bm, quad, lift, m=0, m_under=None):
    """A closed slab over the Blender points `quad` (4, going round), `lift` (a Blender vector)
    thick: its top in `m`, its underside and sides in `m_under` (or `m`)."""
    lo = [bm.verts.new(p) for p in quad]
    hi = [bm.verts.new(p + lift) for p in quad]
    under = m if m_under is None else m_under
    bm.faces.new(hi).material_index = m
    bm.faces.new(list(reversed(lo))).material_index = under
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = under


def faces_since(bm, before):
    return [f for f in bm.faces if f not in before]


def xform_since(bm, before, matrix):
    verts = {v for f in faces_since(bm, before) for v in f.verts}
    for v in verts:
        v.co = matrix @ v.co


# ---------------------------------------------------------------------------------------------
# the ground: its grid from the game (scripts/forest-terrain.ts), and what stands on it

LAYOUT = None  # the layout, for the helpers below (set by build)
TERRAIN = None  # scripts/blender/data/forest_terrain.json (set by build)
RIM_R = 1.1  # the island's rounded corners


def read_terrain(root):
    with open(os.path.join(root, "scripts", "blender", "data", "forest_terrain.json"), encoding="utf-8") as f:
        return json.load(f)


def _grid_y(key, x, z):
    """gridY in shared/terrain.ts: the grid's own triangles (each cell cut from its (-x, -z) corner
    to its (+x, +z) one)."""
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


def in_river(x, z, pad=0.0):
    d, w = river_dist(LAYOUT, x, z)
    return d <= w + pad


def lift_at(x, z):
    """How far up a thing built at y = 0 goes to stand at (x, z): the land there, or nothing in the
    river (its rocks, pebbles and foam keep the water's level)."""
    if TERRAIN is None:
        return 0.0
    return 0.0 if in_river(x, z) else land_y(x, z)


def lift_parts(bm):
    """Stands everything in `bm` on the ground: each loose part (a trunk, a cone, a rock, a plank)
    goes up, whole, by the land under its middle, so nothing is sheared by a slope."""
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


def lift_whole(bm, x, z):
    """Stands everything in `bm` on the ground at (x, z), as one piece (a building, the adit's rock)."""
    dz = lift_at(x, z)
    for v in bm.verts:
        v.co.z += dz


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


def use_col(me):
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass


# ---------------------------------------------------------------------------------------------
# Blender plumbing


def studio(root, call, *args):
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
    rough = ROUGHNESS.get(name, 0.84)
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


def make_object(name, bm, mats, coll, origin=None, recalc=True, parent=None, lift=None):
    """`bm` as a mesh object `name`, its materials `mats`, its origin at the game point `origin`
    (under `parent`, whose origin is at its own game point `parent["origin"]`).

    What stands in the world is built as on flat ground and then stood on the hillside: `lift`
    "parts" raises each loose part by the land under its middle (lift_parts). The tree looks and the
    animals (placed by the game) are left as built."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name + "Mesh")
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
    elif lift == "parts":
        lift_parts(bm)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob["origin"] = list(origin or (0.0, 0.0, 0.0))
    if parent is not None:
        ob.parent = parent
        po = parent["origin"]
        o = origin or (0.0, 0.0, 0.0)
        ob.location = W(o[0] - po[0], o[1] - po[1], o[2] - po[2])
    elif origin is not None:
        ob.location = W(*origin)
    return ob


def bake_modifiers(ob):
    layer = bpy.context.view_layer
    for o in layer.objects:
        o.select_set(False)
    layer.objects.active = ob
    ob.select_set(True)
    for mod in list(ob.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            ob.modifiers.remove(mod)


# ---------------------------------------------------------------------------------------------
# the island


def vc_material(name):
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
    bsdf.inputs["Roughness"].default_value = 0.88
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.88
    m.use_backface_culling = True
    return m


def zone_weight(L, x, z):
    """Each zone's share of the ground's colour at (x, z): its round patch with a wandering edge."""
    wx = x + 0.9 * math.sin(z * 0.45 + 1.3) + 0.45 * math.sin(z * 1.15 + 0.4)
    wz = z + 0.9 * math.sin(x * 0.4 + 2.1) + 0.45 * math.sin(x * 1.25 + 1.1)
    out = []
    for zn in L["zones"]:
        f = zn["floor"]
        if f not in BIOME or f == "meadow":
            continue
        w = smooth(zn["r"] + 0.9, zn["r"] - 1.6, math.hypot(wx - zn["x"], wz - zn["z"]))
        if w > 0:
            out.append((f, w))
    return out


def zone_of(L, x, z):
    best, score = "", 1.0
    for zn in L["zones"]:
        d = math.hypot(x - zn["x"], z - zn["z"]) / zn["r"]
        if d < score:
            best, score = zn["id"], d
    return best


def dirt_field(L):
    """How bare the ground is at (x, z), 0..1: the trails (each along its spline, as wide as it
    says) and the worn spots where people stand (the counter, the bench, the arrival, the keepers),
    all with a ragged edge."""
    lines = []
    for path in L["paths"]:
        pts = path_polyline(path, 0.12)
        pad = max(p[2] for p in pts) / 2 + 0.6
        lines.append(((min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad, min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad), pts))
    wear = [
        (L["counter"]["x"], L["counter"]["z"] + 0.9, 1.9, 0.85),
        (L["workbench"]["x"], L["workbench"]["z"] + 0.9, 1.3, 0.75),
        (L["arrival"]["x"], L["arrival"]["z"] + 0.4, 1.7, 0.8),
        (L["finley"]["x"] - 1.1, L["finley"]["z"], 1.2, 0.7),
        (L["adit"]["x"] + 1.9, L["adit"]["z"], 1.6, 0.75),
    ] + [(f["stand"]["x"] - 0.3, f["stand"]["z"], 0.8, 0.6) for f in L["fishing"]]

    def field(x, z):
        wob = 0.2 * (vnoise(x * 1.7 + 11.0, z * 1.7 - 4.0) - 0.5) + 0.08 * (vnoise(x * 5.1, z * 5.1) - 0.5)
        best = 9.0
        for (x0, x1, z0, z1), pts in lines:
            if x < x0 or x > x1 or z < z0 or z > z1:
                continue
            for (ax, az, aw), (bx, bz, bw) in zip(pts, pts[1:]):
                dx, dz = bx - ax, bz - az
                t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
                d = math.hypot(x - (ax + dx * t), z - (az + dz * t)) - (aw + (bw - aw) * t) / 2
                if d < best:
                    best = d
        w = smooth(0.2, -0.16, best + wob)
        for wx, wz, r, s in wear:
            d = math.hypot(x - wx, z - wz)
            if d < r + 0.3:
                w = max(w, s * smooth(r, r * 0.35, d + wob))
        return w

    return field


def ground_color(L, x, z, dirt, tones):
    """The ground's colour at (x, z): the meadow's grass with each zone's own floor blended in along
    a wandering edge (the birch grove's pale grass, the ridge's stony green, the Glen's gold, the
    shrine's deep moss), mottled, bare dirt where it is trodden, damp earth at the river's lip, stone
    down its bank and the dark bed under the water."""
    grass, earth, soil, bed, stone, bank = tones
    acc, tot = [0.0, 0.0, 0.0], 0.0
    for f, w in zone_weight(L, x, z):
        c = lin(BIOME[f])
        tot += w
        for k in range(3):
            acc[k] += c[k] * w
    base = lin(BIOME["meadow"])
    if tot > 1:
        acc = [a / tot for a in acc]
        tot = 1.0
    col = [base[k] * (1 - tot) + acc[k] for k in range(3)]
    n1 = vnoise(x * 0.33 + 3.1, z * 0.33 - 1.7)
    n2 = vnoise(x * 0.9 - 5.0, z * 0.9 + 2.2)
    n3 = vnoise(x * 2.7 + 0.4, z * 2.7 + 9.1)
    col = [c * (0.86 + 0.2 * n1) * (0.95 + 0.1 * n2) * (0.965 + 0.07 * n3) for c in col]
    w = dirt(x, z)
    if w > 0:
        col = mixc(col, [c * (0.9 + 0.18 * n2) for c in earth], w)
    d, rw = river_dist(L, x, z)
    inside = rw - d
    if inside > -0.55:
        col = mixc(col, bank, 0.7 * smooth(-0.55, 0.02, inside))
    if inside > 0:
        col = mixc(col, stone, smooth(0.0, 0.16, inside))
        col = mixc(col, bed, smooth(0.2, L["terrain"]["bank"] + 0.15, inside))
    # the brook: damp earth up its banks, wet pebbles down its bed (none under its bridge)
    bd, bw = brook_dist(L, x, z)
    if bd < bw + 0.5:
        op = brook_open(L, x, z)
        col = mixc(col, bank, 0.6 * op * smooth(bw + 0.5, bw + 0.12, bd))
        pebble = [c * (0.62 + 0.3 * n3) for c in lin(PALETTE["FW_Pebble"])]
        col = mixc(col, pebble, op * smooth(bw + 0.14, bw - 0.06, bd))
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
    tones = [lin(PALETTE[k]) for k in ("FW_Grass", "FW_Dirt", "FW_Soil", "FW_Bed", "FW_StoneDark", "FW_Bank")]
    soil, deep = lin(PALETTE["FW_Soil"]), lin(PALETTE["FW_SoilDeep"])
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    verts, vcol, rim_of = {}, {}, {}

    def vert(i, k):
        x, z = snap_rim(-half + i * step, -half + k * step, half)
        key = (round(x, 4), round(z, 4))
        v = verts.get(key)
        if v is None:
            rim = rim_inside(x, z, half)
            y = ground_y(x, z) - 0.2 * smooth(0.4, 0.0, rim) ** 2
            v = verts[key] = bm.verts.new(W(x, y, z))
            c = ground_color(L, x, z, dirt, tones)
            vcol[v] = (*mixc(c, soil, 0.65 * smooth(0.32, 0.0, rim)), 1.0)
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
    for f in top:
        for loop in f.loops:
            loop[col] = vcol[loop.vert]
    # the sides: from the rim straight down to the rock beneath, in soil
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
    me = bpy.data.meshes.new("Forest_GroundMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("FW_Meadow"))
    use_col(me)
    ob = bpy.data.objects.new("Forest_Ground", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]
    # the rock beneath
    bm = bmesh.new()
    rng = random.Random(11)
    rings = []
    for scale, y in ((0.985, -1.05), (0.86, -1.6), (0.64, -2.2), (0.36, -2.75)):
        outline = rounded_rect(-half * scale, half * scale, -half * scale, half * scale, 1.1 * scale + 0.3, 10)
        rings.append([bm.verts.new(W(x * (1 + 0.04 * (rng.random() - 0.5)), y + 0.12 * (rng.random() - 0.5) * (y < -1.2), z * (1 + 0.04 * (rng.random() - 0.5)))) for x, z in outline])
    tip = bm.verts.new(W(-0.3, -3.1, 0.4))
    n = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    for i in range(n):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], tip))
    bm.faces.new(list(reversed(rings[0])))
    for f in bm.faces:
        f.smooth = True
    make_object("Forest_Underside", bm, ["FW_SoilDeep"], coll)


def build_water(L, coll):
    """The river's surface, one sheet along its spline: across it a row of vertices at every sample,
    each carrying in its colour what the game's water shader reads (red: how far from the nearer
    bank, 0 at the bank to 1 a metre and a half out; green: 1 on falling water; blue: how far down a
    fall); the fall off the rock step into the pool at its head, and the sheet over the island's edge
    where it leaves."""
    half = L["half"]
    water = L["river"]["water"]
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

    F = river_frame(L, 10)
    cols = 8
    rows = []
    last = None
    # the round head: a few rows behind the first sample, closing to a point's width
    x0, z0, w0, tx0, tz0, nx0, nz0 = F[0]
    for k in range(6, 0, -1):
        back = w0 * math.sin(math.pi / 2 * k / 6)
        ww = max(0.04, w0 * math.cos(math.pi / 2 * k / 6) - 0.02)
        cx, cz = x0 - tx0 * back, z0 - tz0 * back
        rows.append([vert(cx + nx0 * ww * (c / cols * 2 - 1), water, cz + nz0 * ww * (c / cols * 2 - 1), min(min(c, cols - c) / cols * 2 * ww, w0 - back)) for c in range(cols + 1)])
    for x, z, w, tx, tz, nx, nz in F:
        if rim_inside(x, z, half) < 0.05:
            break
        ww = w - 0.02
        rows.append([vert(x + nx * ww * (c / cols * 2 - 1), water, z + nz * ww * (c / cols * 2 - 1), min(c, cols - c) / cols * 2 * ww) for c in range(cols + 1)])
        last = (x, z, w, tx, tz, nx, nz)
    strip(rows)
    # the sheet over the island's edge: the last row carried out along the flow and down the side
    if last is not None:
        x, z, w, tx, tz, nx, nz = last
        curtain = [rows[-1]]
        for out, y, down in ((0.35, water - 0.02, 0.05), (0.5, water - 0.5, 0.45), (0.56, -1.25, 1.0)):
            curtain.append([vert(v.co.x + tx * out, y, -v.co.y + tz * out, 1.5, 1.0, down) for v in rows[-1]])
        strip(curtain)
    # the fall at its head: off the rock step's lip, out in an arc, into the pool
    cs = L["cascade"]
    base = land_y(cs["x"], cs["z"])
    top = cs["top"] + base
    dx, dz = x0 - cs["x"], z0 - cs["z"]
    dist = math.hypot(dx, dz) or 1.0
    ux, uz = dx / dist, dz / dist
    lip, foot = 0.34, dist - w0 + 0.45
    rows = []
    for k in range(10):
        u = k / 9
        s = lip + (foot - lip) * (u ** 0.8)
        y = top + (water + 0.012 - top) * (u ** 1.9)
        w = 0.24 + 0.1 * u
        rows.append([vert(cs["x"] + ux * s - uz * w * (c / 3 * 2 - 1), y, cs["z"] + uz * s + ux * w * (c / 3 * 2 - 1), 1.5, 1.0, u) for c in range(4)])
    strip(rows)
    # the brook (a hand's depth over its bed, wherever the bed goes: each vertex a little over the
    # ground under it); white where it tumbles down the steep of the hill; broken under its bridge
    if "brook" in L:
        B = brook_frame(L, 16)
        rows = []
        run = 0.0
        prev = None
        # its spring: a round head behind the first sample
        x0, z0, w0, tx0, tz0, nx0, nz0 = B[0]
        for k in range(4, 0, -1):
            back = (w0 + 0.05) * math.sin(math.pi / 2 * k / 4)
            ww = max(0.03, (w0 + 0.05) * math.cos(math.pi / 2 * k / 4))
            cx, cz = x0 - tx0 * back, z0 - tz0 * back
            rows.append([vert(cx + nx0 * ww * (c / 4 * 2 - 1), ground_y(cx + nx0 * ww * (c / 4 * 2 - 1), cz + nz0 * ww * (c / 4 * 2 - 1)) + 0.05, cz + nz0 * ww * (c / 4 * 2 - 1), 0.5 - 0.32 * abs(c / 2 - 1)) for c in range(5)])
        for x, z, w, tx, tz, nx, nz in B:
            if prev is not None:
                seg = math.hypot(x - prev[0], z - prev[1])
                run += seg
                steep = (land_y(prev[0], prev[1]) - land_y(x, z)) / (seg or 1)
            else:
                steep = 0.0
            prev = (x, z)
            if brook_open(L, x, z) < 0.75:
                strip(rows)
                rows = []
                continue
            rd, rw = river_dist(L, x, z)
            ww = w + 0.06
            fall = max(0.0, min(0.55, (steep - 0.26) / 0.3))
            rows.append([vert(x + nx * ww * (c / 4 * 2 - 1), max(ground_y(x + nx * ww * (c / 4 * 2 - 1), z + nz * ww * (c / 4 * 2 - 1)) + 0.05, water - 0.03), z + nz * ww * (c / 4 * 2 - 1), 0.5 - 0.32 * abs(c / 2 - 1), fall, (run * 0.9) % 1.0) for c in range(5)])
            if rd < rw - 0.35:
                break
        strip(rows)
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < -1e-4:
            f.normal_flip()
        for loop in f.loops:
            loop[col] = data[loop.vert]
    me = bpy.data.meshes.new("Forest_WaterMesh")
    bm.to_mesh(me)
    bm.free()
    mat = vc_material("FW_Water")
    mat.use_backface_culling = False
    me.materials.append(mat)
    use_col(me)
    ob = bpy.data.objects.new("Forest_Water", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


def build_floors(L, coll):
    """The shrine's flagstone floor round the elderwood."""
    rng = random.Random(5)
    bm = bmesh.new()
    sh = L["shrine"]
    for k in range(18):
        a = 2 * math.pi * k / 18 + 0.1
        for ring, rr in enumerate((0.7, 1.25)):
            if ring == 0 and k % 2:
                continue
            cx, cz = sh["x"] + math.cos(a) * rr, sh["z"] + math.sin(a) * rr
            slab(bm, wobbly_circle(cx, cz, 0.24, 8, 0.15, rng), -0.02, 0.014, 0)
    make_object("Forest_Floors", bm, ["FW_StoneDark"], coll, lift="parts")


def build_falls(L, coll):
    """The fall's rock step at the river's head: two big boulders shoulder to shoulder, a flat slab
    across them that the water runs off, a lip stone under it, smaller ones stepping down either side,
    moss on their tops; stones round the pool's rim."""
    rng = random.Random(64)
    bm = bmesh.new()
    cs = L["cascade"]
    cx, cz, top = cs["x"], cs["z"], cs["top"]
    x0, z0, w0 = L["river"]["points"][0]
    d = math.hypot(x0 - cx, z0 - cz) or 1.0
    ux, uz = (x0 - cx) / d, (z0 - cz) / d  # toward the pool
    px, pz = -uz, ux
    for side, y, fwd, hx, hy, hz, m_ in (
        (-0.62, 0.45, -0.2, 0.8, 0.68, 0.68, 0),
        (0.6, 0.42, -0.15, 0.74, 0.62, 0.64, 1),
        (0.0, top - 0.2, -0.08, 0.66, 0.24, 0.54, 0),
        (0.02, 0.7, 0.3, 0.42, 0.34, 0.3, 1),
        (-1.22, 0.16, 0.5, 0.46, 0.3, 0.4, 1),
        (1.18, 0.14, 0.55, 0.44, 0.28, 0.38, 0),
        (-0.35, 0.2, -0.85, 0.6, 0.4, 0.5, 1),
        (0.55, 0.18, -0.8, 0.5, 0.36, 0.45, 0),
    ):
        x, z = cx + px * side + ux * fwd, cz + pz * side + uz * fwd
        blob(bm, x, y, z, hx, hy, hz, m=m_, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.3)
        if hy > 0.3 and abs(side) > 0.3:
            blob(bm, x, y + hy * 0.82, z, hx * 0.6, 0.06, hz * 0.6, m=2, cuts=2, noise=0.2, rng=rng)
    make_object("Forest_Falls", bm, ["FW_Stone", "FW_StoneDark", "FW_Moss"], coll, lift="parts")


def clear_spot(L, x, z, r):
    """Open ground: off the paths, clear of the trees, the structures, the river and the Titan's
    clearings."""
    if near_path(L, x, z, r + 0.15) or max(abs(x), abs(z)) > L["half"] - 1.0:
        return False
    d, w = river_dist(L, x, z)
    if d < w + 0.55 + r:
        return False
    if any(math.hypot(x - tx, z - tz) < 1.75 + r for tx, tz in L["titanSpots"]):
        return False
    if any(math.hypot(x - f["stand"]["x"], z - f["stand"]["z"]) < 1.0 + r for f in L["fishing"]):
        return False
    if any(math.hypot(x - t["x"], z - t["z"]) < 0.9 + r for t in L["trees"]):
        return False
    if any(math.hypot(x - v[0], z - v[1]) < 0.7 * v[2] + r for v in L["vista"]):
        return False
    c = L["cabin"]
    if c["x"] - c["w"] / 2 - 0.6 < x < c["x"] + c["w"] / 2 + 0.6 and c["z"] - c["d"] / 2 - 0.4 < z < L["counter"]["z"] + 1.2:
        return False
    wb = L["workbench"]
    if abs(x - wb["x"]) < wb["len"] / 2 + 0.7 and abs(z - wb["z"]) < 1.3:
        return False
    for p in (L["finley"], L["arrival"], *L["animals"]):
        if math.hypot(x - p["x"], z - p["z"]) < 1.0 + r:
            return False
    sh = L["shrine"]
    if math.hypot(x - sh["x"], z - sh["z"]) < sh["r"] + 0.5 + r:
        return False
    a = L["archway"]
    if abs(x - a["x"]) < 1.6 and z > a["z"] - 1.6:
        return False
    D = L["dressing"]
    if any(math.hypot(x - bx, z - bz) < 0.6 * bs + 0.3 + r for bx, bz, bs in D["boulders"]) or any(math.hypot(x - px, z - pz) < 0.4 + r for px, pz in D["lanternPosts"] + D["stumps"]):
        return False
    if any(math.hypot(x - f["x"], z - f["z"]) < f["len"] / 2 + 0.3 + r for f in D["fallen"]):
        return False
    if any(math.hypot(x - t["x"], z - t["z"]) < 0.7 * t["s"] + r for t in D["greatTrees"]) or any(math.hypot(x - bx, z - bz) < 0.5 * bs + 0.2 + r for bx, bz, bs in D["birches"] + D["shrubs"]):
        return False
    ad = L["adit"]
    if x < ad["outcrop"]["x1"] + 2.6 and ad["outcrop"]["z0"] - 0.6 < z < ad["outcrop"]["z1"] + 0.6:
        return False
    if math.hypot(x - L["cascade"]["x"], z - L["cascade"]["z"]) < 2.2 + r:
        return False
    if any(math.hypot(x - px, z - pz) < pr + r for px, pz, pr in places_solid(L)):
        return False
    bd, bw = brook_dist(L, x, z)
    if bd < bw + 0.45 + r:
        return False
    return True


def places_solid(L):
    """Where the places stand, as (x, z, radius): nothing grows through a bench, a bed or a tent."""
    P = L.get("places")
    if not P:
        return []
    out = [(P["lookout"]["x"], P["lookout"]["z"], 1.1), (P["camp"]["x"], P["camp"]["z"], P["camp"]["r"] + 0.5), (P["camp"]["leanTo"]["x"], P["camp"]["leanTo"]["z"], 1.0),
           (P["stoneBench"]["x"], P["stoneBench"]["z"], 1.0), ((P["jetty"]["x0"] + P["jetty"]["x1"]) / 2, P["jetty"]["z"], 1.1), (P["rodRack"]["x"], P["rodRack"]["z"], 0.6),
           (P["nets"]["x"], P["nets"]["z"], 0.9), (P["patch"]["x"], P["patch"]["z"], 1.3), (P["wheelbarrow"]["x"], P["wheelbarrow"]["z"], 0.6),
           (P["ropeSwing"]["x"], P["ropeSwing"]["z"], 0.7), (P["ropeSwing"]["tree"][0], P["ropeSwing"]["tree"][1], 0.5), (P["timber"]["x"], P["timber"]["z"], 1.1)]
    out += [(x, z, 0.5 * sz) for x, z, sz in P["stones"]] + [(x, z, 0.5) for x, z in P["hives"]]
    out += [(P["washing"][k][0], P["washing"][k][1], 0.3) for k in ("a", "b")]
    return out


def build_deco(L, coll):
    rng = random.Random(31)
    bm = bmesh.new()
    core = L["core"]
    # 0 tuft, 1 fern, 2 pink, 3 yellow, 4 blue, 5 cap, 6 stem, 7 leaf pile, 8 maple gold

    def fern(x, z, s=1.0):
        # fronds arching up out of the crown and drooping to their tips, each folded along its
        # midrib and tapering at both ends (the fern's material is double-sided)
        for k in range(7):
            a = 2 * math.pi * k / 7 + rng.random() * 0.6
            length = (0.34 + 0.12 * rng.random()) * s
            height = (0.2 + 0.07 * rng.random()) * s
            dx, dz = math.cos(a), math.sin(a)
            px, pz = -dz, dx
            pts = []
            for i in range(7):
                u = i / 6
                y = height * (1.7 * u - 1.25 * u * u) + 0.01
                w = 0.062 * s * math.sin(math.pi * min(1.0, u * 1.04)) ** 0.6 + 0.004
                pts.append((x + dx * length * u, y, z + dz * length * u, w))
            # (the midrib and edges on shared, smooth vertices)
            rows = [(bm.verts.new(W(fx, fy, fz)), bm.verts.new(W(fx + px * w, fy - w * 0.35, fz + pz * w)), bm.verts.new(W(fx - px * w, fy - w * 0.35, fz - pz * w))) for fx, fy, fz, w in pts]
            for i in range(6):
                (m0, l0, r0), (m1, l1, r1) = rows[i], rows[i + 1]
                for quad in ((m0, l0, l1, m1), (m0, m1, r1, r0)):
                    f = bm.faces.new(quad)
                    f.material_index = 1
                    f.smooth = True

    def mushrooms(x, z, n=3):
        # a patch of red-capped mushrooms (the odd one leaning)
        for k in range(n):
            a = rng.random() * 6.28
            rr = 0.04 + 0.14 * rng.random()
            mx, mz = x + rr * math.cos(a), z + rr * math.sin(a)
            s = 0.75 + rng.random() * 0.55
            cylinder(bm, W(mx, 0.0, mz), W(mx, 0.08 * s, mz), 0.02 * s, 6, m=6)
            lathe(bm, mx, mz, [(0, 0.0), (0.06 * s, 0.0), (0.05 * s, 0.03 * s), (0, 0.045 * s)], segs=8, m=5, y0=0.075 * s)

    placed = 0
    tries = 0
    reach = L["half"] - 1.0
    while placed < 300 and tries < 8000:
        tries += 1
        x, z = rng.uniform(-reach, reach), rng.uniform(-reach, reach)
        if not clear_spot(L, x, z, 0.12):
            continue
        zn = zone_of(L, x, z)
        roll = rng.random()
        if zn == "glen" and roll < 0.55:
            # a pile of fallen leaves: a few flat lumps in orange and gold
            for k in range(3):
                blob(bm, x + rng.uniform(-0.15, 0.15), 0.03, z + rng.uniform(-0.15, 0.15), 0.16, 0.035, 0.13, m=7 if k % 2 else 8, cuts=2, noise=0.2, rng=rng)
        elif zn in ("birch", "shrine", "northridge") and roll < 0.45 or zn == "oldgrowth" and roll < 0.75:
            fern(x, z, 0.85)
        elif roll < 0.72:
            # a grass tuft: three thin blades
            for k in range(4):
                a = rng.random() * 6.28
                h = 0.12 + rng.random() * 0.1
                base = W(x + math.cos(a) * 0.04, 0.0, z + math.sin(a) * 0.04)
                side = Vector((math.sin(a), math.cos(a), 0)) * 0.025
                vs = [bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(W(x + math.cos(a) * 0.1, h, z + math.sin(a) * 0.1))]
                bm.faces.new(vs).material_index = 0
        elif roll < 0.9:
            # a wildflower: a stem and a head of petals
            col = rng.choice((2, 3, 4))
            cylinder(bm, W(x, 0.0, z), W(x, 0.16, z), 0.008, 5, m=0)
            blob(bm, x, 0.17, z, 0.045, 0.02, 0.045, m=col, cuts=2)
            blob(bm, x, 0.18, z, 0.015, 0.012, 0.015, m=3 if col != 3 else 6, cuts=1)
        else:
            # a red-capped mushroom (or two)
            for k in range(rng.choice((1, 2))):
                mx, mz = x + k * 0.12, z + k * 0.06
                s = 0.8 + rng.random() * 0.5
                cylinder(bm, W(mx, 0.0, mz), W(mx, 0.08 * s, mz), 0.02 * s, 6, m=6)
                lathe(bm, mx, mz, [(0, 0.0), (0.06 * s, 0.0), (0.05 * s, 0.03 * s), (0, 0.045 * s)], segs=8, m=5, y0=0.075 * s)
        placed += 1

    # ferns at the fellable trees' feet (clear of paths, water and the approach you fell from)
    for t in L["trees"]:
        for k in range(2):
            a = rng.random() * 6.28
            rr = 1.15 + 0.3 * rng.random()
            x, z = t["x"] + rr * math.cos(a), t["z"] + rr * math.sin(a)
            # (not on the side you fell it from: toward the middle of the wood)
            if (x - t["x"]) * (core["x"] - t["x"]) + (z - t["z"]) * (core["z"] - t["z"]) > 0.4 * math.hypot(t["x"] - core["x"], t["z"] - core["z"]):
                continue
            if clear_spot(L, x, z, 0.2):
                fern(x, z, 0.8 + 0.4 * rng.random())
    # the Old Growth's fern floor: a ring of ferns round every great tree, and mushrooms at its roots
    for t in L["dressing"]["greatTrees"]:
        for k in range(4):
            a = rng.random() * 6.28
            rr = (0.9 + 0.7 * rng.random()) * t["s"]
            x, z = t["x"] + rr * math.cos(a), t["z"] + rr * math.sin(a)
            if clear_spot(L, x, z, 0.1):
                fern(x, z, 0.9 + 0.5 * rng.random())
        a = rng.random() * 6.28
        x, z = t["x"] + 0.75 * t["s"] * math.cos(a), t["z"] + 0.75 * t["s"] * math.sin(a)
        if clear_spot(L, x, z, 0.05):
            mushrooms(x, z, 4)
    # red mushroom patches among the fellable trees' roots (on the far side, like the ferns)
    for t in L["trees"]:
        a = rng.random() * 6.28
        for k in range(3):
            rr = 0.75 + 0.3 * rng.random()
            x, z = t["x"] + rr * math.cos(a + k * 2.1), t["z"] + rr * math.sin(a + k * 2.1)
            if (x - t["x"]) * (core["x"] - t["x"]) + (z - t["z"]) * (core["z"] - t["z"]) > 0.4 * math.hypot(t["x"] - core["x"], t["z"] - core["z"]) or not clear_spot(L, x, z, 0.15):
                continue
            mushrooms(x, z, 3 + (k % 2))
            break
    # low wild berry bushes along the trail's margins and the groves' edges
    bushes = 0
    tries = 0
    while bushes < 18 and tries < 1600:
        tries += 1
        x, z = rng.uniform(-reach, reach), rng.uniform(-reach, reach)
        if zone_of(L, x, z) not in ("border", "birch", "cedar") or not clear_spot(L, x, z, 0.45):
            continue
        for k in range(2):
            bx, bz = x + 0.22 * (k - 0.5), z + 0.1 * (k - 0.5)
            blob(bm, bx, 0.15, bz, 0.26, 0.2, 0.24, m=1, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
            for q in range(6):
                a = rng.random() * 6.28
                blob(bm, bx + math.cos(a) * 0.22, 0.16 + rng.uniform(-0.04, 0.1), bz + math.sin(a) * 0.2, 0.028, 0.028, 0.028, m=5, cuts=1)
        bushes += 1
    make_object("Forest_Deco", bm, ["FW_Tuft", "FW_Fern", "FW_Petal", "FW_PetalYellow", "FW_PetalBlue", "FW_MushCap", "FW_MushStem", "FW_LeafPile", "FW_MapleLeafGold"], coll, lift="parts")


def shrine_stones(L):
    sh = L["shrine"]
    gap = 0.26 * math.pi
    open_ = math.atan2(L["core"]["z"] - sh["z"], L["core"]["x"] - sh["x"])
    n = sh["stones"]
    return [(sh["x"] + math.cos(a) * sh["r"], sh["z"] + math.sin(a) * sh["r"], a) for a in (open_ + gap / 2 + (k / (n - 1)) * (2 * math.pi - gap) for k in range(n))]


def build_rocks(L, coll):
    rng = random.Random(33)
    bm = bmesh.new()
    rv = L["river"]
    water = rv["water"]
    a = L["half"] - 0.4
    # the river's rocks, half out of the water
    for rx, rz, s in rv["rocks"]:
        blob(bm, rx, water + 0.05, rz, 0.5 * s, 0.3 * s, 0.42 * s, m=0, cuts=3, noise=0.12, rng=rng)
    # along both banks: stones on the lip now and then, and pebbles all along the water line (the
    # pebble bed showing at the edges), clear of the fishing spots
    F = river_frame(L, 12)
    k = 0
    for side in (1, -1):
        for i, (x, z, w, tx, tz, nx, nz) in enumerate(F):
            for sub in range(2):
                u = sub * 0.5
                if i + 1 >= len(F):
                    break
                x2, z2, w2 = F[i + 1][0], F[i + 1][1], F[i + 1][2]
                cx, cz, cw = x + (x2 - x) * u, z + (z2 - z) * u, w + (w2 - w) * u
                px, pz = cx + nx * side * (cw - 0.07), cz + nz * side * (cw - 0.07)
                if not in_rounded(px, pz, a, 0.78) or any(math.hypot(px - f["stand"]["x"], pz - f["stand"]["z"]) < 1.1 for f in L["fishing"]):
                    continue
                ps = 0.05 + rng.random() * 0.05
                blob(bm, px + rng.uniform(-0.05, 0.05), water + 0.015, pz + rng.uniform(-0.05, 0.05), ps * 1.3, ps * 0.55, ps, m=4 if k % 3 else 1, cuts=1, noise=0.15, rng=rng)
                k += 1
            if i % 3 == 0:
                bx, bz = x + nx * side * (w + 0.14), z + nz * side * (w + 0.14)
                if in_rounded(bx, bz, a, 0.78) and all(math.hypot(bx - f["stand"]["x"], bz - f["stand"]["z"]) > 1.2 for f in L["fishing"]) and not near_path(L, bx, bz, 0.2):
                    sc = 0.7 + rng.random() * 0.6
                    blob(bm, bx, 0.02, bz, 0.22 * sc, 0.14 * sc, 0.26 * sc, m=k % 2, cuts=2, noise=0.15, rng=rng, flat_bottom=-0.2)
                    # (every other one mossy: a soft green cap on its top)
                    if i % 2 == 0:
                        blob(bm, bx - 0.02, 0.02 + 0.12 * sc, bz, 0.17 * sc, 0.045 * sc, 0.2 * sc, m=2, cuts=2, noise=0.2, rng=rng)
    # the Cedar Ridge's boulders, off the paths and away from the trees
    placed = 0
    tries = 0
    ridge = next(zn for zn in L["zones"] if zn["id"] == "cedar")
    while placed < 7 and tries < 400:
        tries += 1
        x, zz = ridge["x"] + rng.uniform(-ridge["r"], ridge["r"]), ridge["z"] + rng.uniform(-ridge["r"], ridge["r"])
        s = 0.6 + rng.random() * 0.7
        if not clear_spot(L, x, zz, 0.45 * s):
            continue
        blob(bm, x, 0.12 * s, zz, 0.45 * s, 0.32 * s, 0.38 * s, m=placed % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.2)
        blob(bm, x, 0.33 * s, zz, 0.3 * s, 0.06 * s, 0.25 * s, m=2, cuts=2, noise=0.2, rng=rng)  # a cap of moss
        placed += 1
    # the shrine's standing stones: tall, mossy, a glowing rune on each one's inner face
    sh = L["shrine"]
    for x, zz, a in shrine_stones(L):
        h = 0.95 + 0.25 * rng.random()
        blob(bm, x, h / 2 - 0.05, zz, 0.2, h / 2 + 0.05, 0.16, m=1, cuts=3, n=2.8, noise=0.06, rng=rng, flat_bottom=-0.1)
        blob(bm, x, h - 0.02, zz, 0.18, 0.06, 0.15, m=2, cuts=2, noise=0.25, rng=rng)
        ix, iz = -math.cos(a), -math.sin(a)  # toward the elderwood
        blob(bm, x + ix * 0.15, h * 0.55, zz + iz * 0.15, 0.06, 0.1, 0.06, m=3, cuts=1, n=1.4)
    make_object("Forest_Rocks", bm, ["FW_Stone", "FW_StoneDark", "FW_Moss", "FW_Rune", "FW_Pebble"], coll, lift="parts")


def pine(bm, x, z, s, rng, light, bark=0, needle=1, needle_light=2):
    lathe(bm, x, z, [(0, 0.0), (0.16 * s, 0.0), (0.14 * s, 0.75 * s), (0, 0.8 * s)], segs=9, m=bark, jitter=0.1, rng=rng)
    yaw = rng.random() * 3
    tiers = ((1.05, 0.55, 1.15), (0.82, 1.25, 1.0), (0.58, 1.9, 0.95))
    for k, (rad, base, tall) in enumerate(tiers):
        R, y0, H = rad * s, base * s, tall * s
        prof = [(0, y0), (R * 0.95, y0 + 0.02 * s), (R, y0 + 0.1 * s), (R * 0.72, y0 + 0.28 * H), (R * 0.4, y0 + 0.6 * H), (0, y0 + H)]
        lathe(bm, x, z, prof, segs=11, m=needle_light if (k == 2) == light else needle, yaw=yaw + k, jitter=0.06, rng=rng)


def build_vista(L, coll):
    rng = random.Random(21)
    bm = bmesh.new()
    for i, (x, z, s) in enumerate(L["vista"]):
        pine(bm, x, z, s * 1.55, rng, light=i % 2 == 1)
    # the Old Growth's great pines (the dressing's: not felled, half as tall again as the rim's)
    for i, t in enumerate(L["dressing"]["greatTrees"]):
        if t["kind"] == "pine":
            pine(bm, t["x"], t["z"], t["s"] * 1.55, rng, light=i % 3 == 1)
    make_object("Forest_Vista", bm, ["FW_PineBark", "FW_PineNeedle", "FW_PineNeedleLight"], coll, lift="parts")
    # its ancient cedars: five tiers, a red trunk as thick as a barrel
    bm = bmesh.new()
    for t in L["dressing"]["greatTrees"]:
        if t["kind"] != "cedar":
            continue
        before = set(bm.faces)
        cone_tree(bm, t["s"] * 1.45, rng, ((0.95, 0.8, 1.0), (0.8, 1.4, 0.95), (0.64, 1.95, 0.9), (0.46, 2.45, 0.85), (0.28, 2.9, 0.8)), 0, 1, 2, trunk_r=0.22, trunk_h=1.0)
        xform_since(bm, before, Matrix.Translation(W(t["x"], 0.0, t["z"])))
    make_object("Forest_VistaCedars", bm, ["FW_CedarBark", "FW_CedarNeedle", "FW_CedarNeedleLight"], coll, lift="parts")
    # the birches that are not felled (the North Ridge's stand, the rise's few)
    bm = bmesh.new()
    for x, z, sz in L["dressing"]["birches"]:
        before = set(bm.faces)
        birch_tree(bm, sz * 1.1, rng)
        xform_since(bm, before, Matrix.Translation(W(x, 0.0, z)) @ Matrix.Rotation(rng.random() * 6.28, 4, "Z"))
    make_object("Forest_VistaBirches", bm, ["FW_BirchBark", "FW_BirchMark", "FW_BirchLeaf", "FW_BirchLeafLight"], coll, lift="parts")


# ---------------------------------------------------------------------------------------------
# what Bramble built: the archway, his cabin and counter, the workbench, the splitting block


def build_structures(L, cushions, coll):
    rng = random.Random(55)
    bm = bmesh.new()
    # materials: 0 bark, 1 log, 2 cut wood, 3 plank, 4 plank dark, 5 roof, 6 window, 7 iron,
    # 8 stone, 9 rope, 10 honey, 11 cloth, 12 red, 13 pine needle
    # --- the branch archway back to the campfire ---
    ar = L["archway"]
    ax, az, hw, h = ar["x"], ar["z"], ar["w"] / 2, ar["h"]
    for sx in (-1, 1):
        cylinder(bm, W(ax + sx * hw, -0.05, az), W(ax + sx * hw * 0.96, h - 0.35, az), 0.12, 12, m=0, cap_m=2, r_end=0.1, wobble=0.08, rng=rng)
        blob(bm, ax + sx * hw, 0.06, az, 0.2, 0.1, 0.2, m=0, cuts=2, noise=0.15, rng=rng, flat_bottom=-0.02)
    pts = [(ax + (j / 12 * 2 - 1) * hw * 0.96, h - 0.35 + math.sin(math.pi * j / 12) * 0.42, az) for j in range(13)]
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        cylinder(bm, W(x0, y0, z0), W(x1, y1, z1), 0.085, 10, m=0)
        blob(bm, x1, y1 + 0.04, z1 - 0.02, 0.13, 0.09, 0.12, m=13, cuts=2, noise=0.25, rng=rng)
    ly = h - 0.23
    cylinder(bm, W(ax, ly + 0.28, az), W(ax, ly + 0.14, az), 0.008, 6, m=7)
    lathe(bm, ax, az, [(0, 0.0), (0.06, 0.0), (0.07, 0.1), (0.05, 0.14), (0, 0.15)], segs=10, m=6, y0=ly - 0.02)
    lathe(bm, ax, az, [(0, 0.12), (0.075, 0.12), (0.03, 0.18), (0, 0.19)], segs=10, m=7, y0=ly - 0.02)
    board_y = h - 0.75
    for sx in (-0.42, 0.42):
        cylinder(bm, W(ax + sx, board_y + 0.2, az + 0.02), W(ax + sx, h - 0.33, az + 0.02), 0.008, 6, m=9)
    box(bm, ax - 0.55, ax + 0.55, board_y - 0.14, board_y + 0.14, az + 0.01, az + 0.06, m=3)
    blob(bm, ax - 0.25, board_y, az - 0.01, 0.08, 0.09, 0.01, m=12, cuts=2, n=1.6)  # a painted campfire
    blob(bm, ax - 0.25, board_y - 0.02, az - 0.015, 0.04, 0.05, 0.008, m=10, cuts=1, n=1.4)
    # --- Bramble's log cabin: stacked logs, a gable roof along x, a stone chimney, a door and two
    # warm windows on the front (+z) facing his counter ---
    c = L["cabin"]
    cx, cz, w, d, ht = c["x"], c["z"], c["w"], c["d"], c["h"]
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    lr = 0.13
    y = lr
    row = 0
    while y < ht - 0.1:
        ext = 0.18 if row % 2 == 0 else 0.1
        for zz in (z0, z1):
            cylinder(bm, W(x0 - ext, y, zz), W(x1 + ext, y, zz), lr, 10, m=1, cap_m=2, wobble=0.04, rng=rng)
        for xx in (x0, x1):
            cylinder(bm, W(xx, y + lr * 0.5, z0 - ext), W(xx, y + lr * 0.5, z1 + ext), lr, 10, m=1, cap_m=2, wobble=0.04, rng=rng)
        y += 2 * lr * 0.92
        row += 1
    box(bm, x0 + 0.05, x1 - 0.05, 0.0, ht - 0.05, z0 + 0.05, z1 - 0.05, m=4)  # the inner wall behind the logs
    # the gables (planks) and the roof, overhanging
    peak = ht + 1.0
    # the gable ends: closed triangular prisms of plank
    for xa, xb in ((x0 - 0.02, x0 + 0.06), (x1 - 0.06, x1 + 0.02)):
        tri = [(ht - 0.12, z0 - 0.02), (ht - 0.12, z1 + 0.02), (peak - 0.08, cz)]
        a = [bm.verts.new(W(xa, y_, z_)) for y_, z_ in tri]
        b = [bm.verts.new(W(xb, y_, z_)) for y_, z_ in tri]
        bm.faces.new(a).material_index = 4
        bm.faces.new(list(reversed(b))).material_index = 4
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((a[i], b[i], b[j], a[j])).material_index = 4
    # the roof: two slopes of shingle rows, each a closed slab
    ov = 0.35
    for side in (-1, 1):
        zz_eave = cz + side * (d / 2 + ov)
        y_eave = ht - 0.1 - ov * (peak - ht) / (d / 2)
        rows_ = 5
        for k in range(rows_):
            t0, t1 = k / rows_, (k + 1) / rows_
            za, zb = zz_eave + (cz - zz_eave) * t0, zz_eave + (cz - zz_eave) * t1
            ya, yb = y_eave + (peak - y_eave) * t0, y_eave + (peak - y_eave) * t1
            quad = [W(x0 - ov, ya, za), W(x1 + ov, ya, za), W(x1 + ov, yb + 0.04, zb), W(x0 - ov, yb + 0.04, zb)]
            hexa(bm, quad, Vector((0, 0, 0.07)), m=5, m_under=4)
    cylinder(bm, W(x0 - ov, peak, cz), W(x1 + ov, peak, cz), 0.08, 8, m=1, cap_m=2)  # the ridge log
    # the chimney, stones up the west end
    for k in range(9):
        sy = 0.2 + k * 0.42
        blob(bm, x0 - 0.3, sy, cz - 0.1, 0.32 - k * 0.012, 0.22, 0.3 - k * 0.012, m=8, cuts=2, noise=0.12, rng=rng)
    # the door and the windows on the front
    fz = z1 + lr + 0.01
    box(bm, cx - 0.36, cx + 0.36, 0.0, 1.55, fz - 0.03, fz + 0.03, m=3)
    for k in range(4):
        box(bm, cx - 0.36 + k * 0.18 + 0.005, cx - 0.36 + (k + 1) * 0.18 - 0.005, 0.02, 1.53, fz + 0.03, fz + 0.045, m=4)
    blob(bm, cx + 0.24, 0.8, fz + 0.07, 0.03, 0.03, 0.03, m=7, cuts=1)  # the handle
    for sx in (-1, 1):
        wx = cx + sx * 1.1
        box(bm, wx - 0.34, wx + 0.34, 0.85, 1.55, fz - 0.02, fz + 0.02, m=6)
        box(bm, wx - 0.4, wx + 0.4, 0.8, 0.86, fz - 0.02, fz + 0.08, m=4)
        box(bm, wx - 0.4, wx + 0.4, 1.54, 1.6, fz - 0.02, fz + 0.06, m=4)
        box(bm, wx - 0.02, wx + 0.02, 0.86, 1.54, fz + 0.02, fz + 0.05, m=4)
        box(bm, wx - 0.34, wx + 0.34, 1.18, 1.22, fz + 0.02, fz + 0.05, m=4)
        box(bm, wx - 0.38, wx + 0.38, 0.72, 0.8, fz, fz + 0.25, m=3)  # a window box
        for k in range(4):
            blob(bm, wx - 0.27 + k * 0.18, 0.84, fz + 0.14, 0.08, 0.06, 0.08, m=13 if k % 2 else 12, cuts=2)
    # the porch lantern by the door
    cylinder(bm, W(cx + 0.5, 1.9, fz), W(cx + 0.5, 1.9, fz + 0.2), 0.015, 6, m=7)
    lathe(bm, cx + 0.5, fz + 0.2, [(0, 0.0), (0.05, 0.0), (0.06, 0.09), (0.04, 0.12), (0, 0.13)], segs=8, m=6, y0=1.72)
    # --- the store counter: planks, goods on top, a hanging sign above on two poles ---
    k_ = L["counter"]
    kx0, kx1 = k_["x"] - k_["len"] / 2, k_["x"] + k_["len"] / 2
    kz0, kz1 = k_["z"] - k_["w"] / 2, k_["z"] + k_["w"] / 2
    top = k_["top"]
    box(bm, kx0, kx1, top - 0.07, top, kz0 - 0.04, kz1 + 0.04, m=3)
    for j in range(8):
        bx0 = kx0 + (kx1 - kx0) * j / 8
        box(bm, bx0 + 0.005, bx0 + (kx1 - kx0) / 8 - 0.005, 0.0, top - 0.07, kz1 - 0.05, kz1, m=4 if j % 2 else 3)
    for sx in (kx0 + 0.05, kx1 - 0.05):
        box(bm, sx - 0.05, sx + 0.05, 0.0, top - 0.07, kz0, kz1, m=1)
    # the goods: a jar of honey, a basket of fish, a bundle of logs
    lathe(bm, kx0 + 0.3, k_["z"], [(0, 0.0), (0.07, 0.0), (0.08, 0.1), (0.05, 0.14), (0, 0.15)], segs=12, m=10, y0=top)
    lathe(bm, kx0 + 0.3, k_["z"], [(0, 0.13), (0.06, 0.13), (0.06, 0.17), (0, 0.17)], segs=12, m=11, y0=top)
    lathe(bm, kx1 - 0.35, k_["z"], [(0, 0.0), (0.16, 0.0), (0.19, 0.12), (0, 0.12)], segs=14, m=9, y0=top)
    for q in range(3):
        blob(bm, kx1 - 0.42 + q * 0.07, top + 0.14, k_["z"] - 0.03 + (q % 2) * 0.06, 0.08, 0.025, 0.03, m=7 if q == 1 else 11, cuts=2)
    for q in range(3):
        cylinder(bm, W(k_["x"] + 0.05 + q * 0.09, top + 0.05, k_["z"] - 0.12), W(k_["x"] + 0.05 + q * 0.09, top + 0.05, k_["z"] + 0.12), 0.045, 8, m=1, cap_m=2)
    # the hanging sign: two poles at the counter's ends, a crossbar, a board with a painted paw
    for sx in (kx0 + 0.05, kx1 - 0.05):
        cylinder(bm, W(sx, top, kz1 - 0.02), W(sx, 2.05, kz1 - 0.02), 0.035, 8, m=0)
    cylinder(bm, W(kx0 - 0.02, 2.0, kz1 - 0.02), W(kx1 + 0.02, 2.0, kz1 - 0.02), 0.03, 8, m=0)
    for sx in (-0.35, 0.35):
        cylinder(bm, W(k_["x"] + sx, 2.0, kz1 - 0.02), W(k_["x"] + sx, 1.8, kz1 - 0.02), 0.008, 6, m=9)
    box(bm, k_["x"] - 0.55, k_["x"] + 0.55, 1.5, 1.82, kz1 - 0.04, kz1 + 0.01, m=3)
    blob(bm, k_["x"], 1.64, kz1 + 0.015, 0.09, 0.075, 0.008, m=4, cuts=2)  # the paw's pad
    for q in range(4):
        blob(bm, k_["x"] - 0.1 + q * 0.066, 1.75 - (0.02 if q in (0, 3) else 0), kz1 + 0.015, 0.028, 0.032, 0.006, m=4, cuts=1)
    # --- the advanced workbench: a heavy bench, a vise, a tool rack along its back ---
    wb = L["workbench"]
    wx0, wx1 = wb["x"] - wb["len"] / 2, wb["x"] + wb["len"] / 2
    wz0, wz1 = wb["z"] - wb["w"] / 2, wb["z"] + wb["w"] / 2
    wt = wb["top"]
    box(bm, wx0, wx1, wt - 0.09, wt, wz0, wz1, m=3)
    for lx in (wx0 + 0.08, wx1 - 0.08):
        for lz in (wz0 + 0.08, wz1 - 0.08):
            box(bm, lx - 0.06, lx + 0.06, 0.0, wt - 0.09, lz - 0.06, lz + 0.06, m=4)
    box(bm, wx0 + 0.08, wx1 - 0.08, 0.2, 0.26, wz0 + 0.08, wz1 - 0.08, m=4)  # the lower shelf
    for q in range(4):
        cylinder(bm, W(wx0 + 0.25 + q * 0.12, 0.3, wz0 + 0.15), W(wx0 + 0.25 + q * 0.12, 0.3, wz1 - 0.15), 0.045, 7, m=1, cap_m=2)
    box(bm, wx0 - 0.02, wx0 + 0.16, wt, wt + 0.12, wz1 - 0.1, wz1 + 0.04, m=7)  # the vise, on the trail side
    cylinder(bm, W(wx0 + 0.07, wt + 0.06, wz1 + 0.04), W(wx0 + 0.07, wt + 0.06, wz1 + 0.2), 0.015, 6, m=7)
    # the tool rack along the back (toward the cabin): a board on two posts, saws, a mallet, chisels
    for px in (wx0 + 0.06, wx1 - 0.06):
        box(bm, px - 0.04, px + 0.04, wt, wt + 0.75, wz0 + 0.01, wz0 + 0.06, m=4)
    box(bm, wx0 + 0.02, wx1 - 0.02, wt + 0.3, wt + 0.72, wz0 + 0.02, wz0 + 0.05, m=3)
    box(bm, wx0 + 0.25, wx0 + 0.65, wt + 0.45, wt + 0.6, wz0 + 0.06, wz0 + 0.08, m=7)  # a saw's blade
    box(bm, wx0 + 0.18, wx0 + 0.27, wt + 0.44, wt + 0.61, wz0 + 0.05, wz0 + 0.09, m=1)
    cylinder(bm, W(wx1 - 0.4, wt + 0.35, wz0 + 0.08), W(wx1 - 0.4, wt + 0.6, wz0 + 0.08), 0.015, 6, m=1)
    blob(bm, wx1 - 0.4, wt + 0.64, wz0 + 0.08, 0.07, 0.045, 0.045, m=1, cuts=2)
    for q in range(3):
        cylinder(bm, W(wx1 - 0.25 + q * 0.06, wt + 0.4, wz0 + 0.08), W(wx1 - 0.25 + q * 0.06, wt + 0.6, wz0 + 0.08), 0.012, 6, m=7 if q % 2 else 1)
    # a carving in progress on the bench, shavings round it
    blob(bm, wb["x"] + 0.1, wt + 0.08, wb["z"], 0.12, 0.08, 0.09, m=2, cuts=2)
    for q in range(6):
        blob(bm, wb["x"] + rng.uniform(-0.4, 0.5), wt + 0.01, wb["z"] + rng.uniform(-0.25, 0.25), 0.03, 0.008, 0.02, m=2, cuts=1)
    # --- the river's fishing spots, each facing the water: a flat stone out over it to stand on, a
    # raw fallen log or a smooth boulder to sit on (their tops the log and boulder cushions', the
    # game's seats), and a little fish sign on a stake behind ---
    for f in L["fishing"]:
        sx, sz = f["stand"]["x"], f["stand"]["z"]
        fx, fz = f.get("face", (f["bobber"]["x"] - sx, f["bobber"]["z"] - sz))
        d = math.hypot(fx, fz) or 1
        fx, fz = fx / d, fz / d
        ax_, az_ = -fz, fx  # along the bank
        seat = f.get("seat")
        if seat == "log":
            radius = cushions["log"]["h"] / 2
            cy = cushions["log"]["y"]
            e0 = W(sx - ax_ * 0.7, cy, sz - az_ * 0.7)
            e1 = W(sx + ax_ * 0.7, cy, sz + az_ * 0.7)
            cylinder(bm, e0, e1, radius, 14, m=0, cap_m=2, wobble=0.04, rng=rng)
            # a stub of a branch, and moss on its back
            cylinder(bm, W(sx + ax_ * 0.35, cy + radius * 0.6, sz + az_ * 0.35), W(sx + ax_ * 0.45 - fx * 0.12, cy + radius + 0.12, sz + az_ * 0.45 - fz * 0.12), 0.035, 7, m=0, r_end=0.02)
        elif seat == "rock":
            top = cushions["boulder"]["top"]
            blob(bm, sx, top / 2 - 0.02, sz, 0.4, top / 2 + 0.02, 0.34, m=8, cuts=4, n=2.6, noise=0.05, rng=rng, flat_bottom=-0.05)
        else:
            slab(bm, wobbly_circle(sx + fx * 0.55, sz + fz * 0.55, 0.42, 10, 0.1, rng), -0.3, 0.035, 8)
        px, pz = sx - fx * 0.55 + ax_ * 0.45, sz - fz * 0.55 + az_ * 0.45
        cylinder(bm, W(px, 0.0, pz), W(px, 0.75, pz), 0.03, 6, m=0)
        box(bm, px - 0.16, px + 0.16, 0.6, 0.78, pz - 0.02, pz + 0.02, m=3)
        blob(bm, px, 0.69, pz + 0.025, 0.09, 0.035, 0.006, m=11, cuts=2)
    build_adit(L, bm, rng)
    make_object("Forest_Structures", bm, ["FW_Bark", "FW_Log", "FW_WoodCut", "FW_Plank", "FW_PlankDark", "FW_Roof", "FW_Window", "FW_Iron", "FW_Stone", "FW_Rope", "FW_Honey", "FW_Cloth", "FW_Red", "FW_PineNeedle", "FW_Moss", "FW_LeafPile"], coll, lift="parts")


def stand(bm, x, z, yaw=0.0):
    """Turns everything in `bm` (built round the origin, facing the game's +z) to the game heading
    `yaw` and stands it, whole, on the land at (x, z)."""
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((x, -z, lift_at(x, z)))) @ Matrix.Rotation(yaw, 4, "Z"), verts=bm.verts[:])


def build_places(L, cushions, coll):
    """The places to stop (docs/maps-fill-plan.md part 3; the layout's `places`, their seats and
    colliders in forest.ts): the Ranger's Lookout's bench and the cold camp in the Old Growth, the
    Old Stones along the North Ridge with their bench, Finley's jetty, rod rack and drying nets,
    Bramble's garden (hives, a vegetable patch in wattle, a wheelbarrow, a washing line, the rope
    swing's leaning tree: its plank on its ropes is the node `Prop_RopeSwing`, hung from the branch
    the game turns it about) and the timber stack on the south verge."""
    P = L.get("places")
    if not P:
        return
    rng = random.Random(5150)
    M = ["FW_Stone", "FW_StoneDark", "FW_Moss", "FW_Rune", "FW_Bark", "FW_Log", "FW_WoodCut", "FW_Plank", "FW_PlankDark", "FW_Roof", "FW_Iron", "FW_Rope", "FW_Honey", "FW_Cloth", "FW_Red",
         "FW_MossDeep", "FW_Soil", "FW_Canvas", "FW_Hive", "FW_Leafy", "FW_Pumpkin", "FW_Net", "FW_Ash", "FW_Tuft", "FW_PetalYellow", "FW_Pebble"]
    m = {name: i for i, name in enumerate(M)}
    log_top = cushions["log"]["top"]

    # --- the Ranger's Lookout: a plank bench with a back (its seat the picnicBench cushion's top)
    Lk = P["lookout"]
    top = cushions["picnicBench"]["top"]
    bm = bmesh.new()
    for k in range(3):
        box(bm, -0.68, 0.68, top - 0.04, top, -0.2 + k * 0.135, -0.075 + k * 0.135, m=m["FW_Plank"])
    for k in range(2):
        box(bm, -0.68, 0.68, top + 0.16 + k * 0.17, top + 0.3 + k * 0.17, -0.27 - k * 0.03, -0.235 - k * 0.03, m=m["FW_Plank"])
    for sx in (-1, 1):
        box(bm, sx * 0.56 - 0.04, sx * 0.56 + 0.04, -0.3, top - 0.04, -0.2, 0.19, m=m["FW_PlankDark"])
        cylinder(bm, W(sx * 0.56, top - 0.04, -0.2), W(sx * 0.56, top + 0.52, -0.3), 0.03, 6, m=m["FW_PlankDark"])
    stand(bm, Lk["x"], Lk["z"], math.atan2(Lk["face"][0], Lk["face"][1]))
    make_object("Forest_Lookout", bm, M, coll)

    # --- the cold camp: a canvas lean-to (open toward the ring), a bedroll and a pack inside
    C = P["camp"]
    lt = C["leanTo"]
    bm = bmesh.new()
    for sx in (-1, 1):
        cylinder(bm, W(sx * 0.5, -0.1, 0.42), W(sx * 0.5, 1.25, 0.42), 0.03, 6, m=m["FW_Bark"])
        cylinder(bm, W(sx * 0.5, 1.22, 0.42), W(sx * 0.5, 0.0, -0.5), 0.022, 5, m=m["FW_Bark"])
    cylinder(bm, W(-0.58, 1.24, 0.42), W(0.58, 1.24, 0.42), 0.028, 6, m=m["FW_Bark"])
    sheet_pts = lambda u, v: W(-0.56 + 1.12 * v, 1.26 - 1.24 * u + 0.03 * math.sin(v * math.pi), 0.44 - 0.98 * u)
    verts = [[bm.verts.new(sheet_pts(i / 5, j / 5)) for j in range(6)] for i in range(6)]
    for i in range(5):
        for j in range(5):
            bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1])).material_index = m["FW_Canvas"]
    cylinder(bm, W(-0.36, 0.08, -0.12), W(0.3, 0.08, -0.12), 0.09, 8, m=m["FW_Red"], cap_m=m["FW_Cloth"])
    blob(bm, 0.3, 0.14, 0.18, 0.13, 0.15, 0.1, m=m["FW_PlankDark"], cuts=2, noise=0.06, rng=rng, flat_bottom=0.0)
    stand(bm, lt["x"], lt["z"], math.atan2(C["x"] - lt["x"], C["z"] - lt["z"]))
    make_object("Forest_CampLeanTo", bm, M, coll)

    bm = bmesh.new()
    # its cold ring of stones, and the two log seats facing it (their tops the log cushion's)
    lathe(bm, C["x"], C["z"], [(0, 0.0), (0.26, 0.0), (0.2, 0.03), (0, 0.035)], segs=12, m=m["FW_Ash"])
    for k in range(9):
        a = 6.283 * k / 9 + rng.uniform(-0.1, 0.1)
        blob(bm, C["x"] + math.cos(a) * 0.32, 0.04, C["z"] + math.sin(a) * 0.32, rng.uniform(0.08, 0.11), 0.07, rng.uniform(0.07, 0.1), m=m["FW_Stone"] if k % 2 else m["FW_StoneDark"], cuts=2, noise=0.1, rng=rng, flat_bottom=-0.05)
    for k in range(2):
        cylinder(bm, W(C["x"] - 0.14, 0.05, C["z"] - 0.1 + k * 0.16), W(C["x"] + 0.15, 0.07, C["z"] + 0.04 - k * 0.12), 0.035, 6, m=m["FW_StoneDark"], cap_m=m["FW_Ash"])
    for deg in C["logs"]:
        a = math.radians(deg)
        x, z = C["x"] + math.cos(a) * C["r"], C["z"] + math.sin(a) * C["r"]
        ax, az = -math.sin(a), math.cos(a)
        cylinder(bm, W(x - ax * 0.5, log_top / 2, z - az * 0.5), W(x + ax * 0.5, log_top / 2, z + az * 0.5), log_top / 2, 11, m=m["FW_Bark"], cap_m=m["FW_WoodCut"], wobble=0.06, rng=rng)
        blob(bm, x + ax * 0.2, log_top - 0.01, z + az * 0.2, 0.16, 0.03, 0.11, m=m["FW_Moss"], cuts=2, noise=0.15, rng=rng)

    # --- the Old Stones: five weathered standing stones along the ridge, a rune on each one's south
    # face (it glows as the shrine's do), and a stone bench (its top the boulder cushion's)
    for x, z, sz in P["stones"]:
        h = (1.45 + 0.4 * rng.random()) * sz
        lean = rng.uniform(-0.06, 0.06)
        blob(bm, x + lean, h / 2 - 0.05, z, 0.27 * sz, h / 2 + 0.05, 0.2 * sz, m=m["FW_StoneDark"], cuts=3, n=2.8, noise=0.07, rng=rng, flat_bottom=-0.15)
        blob(bm, x + lean, h - 0.02, z, 0.24 * sz, 0.07, 0.19 * sz, m=m["FW_Moss"], cuts=2, noise=0.25, rng=rng)
        blob(bm, x + lean - 0.1 * sz, 0.1, z + 0.12, 0.2 * sz, 0.12, 0.16 * sz, m=m["FW_MossDeep"], cuts=2, noise=0.2, rng=rng, flat_bottom=-0.05)
        for k, (dy, hw) in enumerate(((0.62, 0.075), (0.48, 0.05), (0.36, 0.075))):
            blob(bm, x + lean + (0.02 if k == 1 else 0.0), h * dy, z + 0.19 * sz, hw, 0.035, 0.03, m=m["FW_Rune"], cuts=1, n=1.6)
        blob(bm, x + lean, h * 0.49, z + 0.19 * sz, 0.022, h * 0.15, 0.03, m=m["FW_Rune"], cuts=1, n=1.6)
    Sb = P["stoneBench"]
    b_top = cushions["boulder"]["top"]
    for sx in (-1, 1):
        blob(bm, Sb["x"] + sx * 0.5, (b_top - 0.1) / 2, Sb["z"], 0.16, (b_top - 0.1) / 2 + 0.03, 0.2, m=m["FW_StoneDark"], cuts=2, n=3.5, noise=0.05, rng=rng, flat_bottom=-0.08)
    make_object("Forest_Places", bm, M, coll, lift="parts")
    bm = bmesh.new()
    blob(bm, 0.0, b_top - 0.06, 0.0, 0.78, 0.06, 0.25, m=m["FW_Stone"], cuts=3, n=4.0, noise=0.03, rng=rng)
    blob(bm, 0.5, b_top + 0.0, -0.12, 0.2, 0.025, 0.1, m=m["FW_Moss"], cuts=2, noise=0.2, rng=rng)
    stand(bm, Sb["x"], Sb["z"])
    make_object("Forest_StoneBench", bm, M, coll)

    # --- Finley's corner: the jetty (its deck the dock cushion's top), the rod rack, the drying nets
    J = P["jetty"]
    d_top = cushions["dock"]["top"]
    water = L["river"]["water"]
    bm = bmesh.new()
    n = int((J["x1"] - J["x0"]) / 0.19)
    for k in range(n):
        x0 = J["x0"] + k * (J["x1"] - J["x0"]) / n
        box(bm, x0 + 0.008, x0 + (J["x1"] - J["x0"]) / n - 0.008, d_top - 0.045, d_top, J["z"] - J["w"] / 2, J["z"] + J["w"] / 2, m=m["FW_Plank"] if k % 3 else m["FW_PlankDark"])
    for sz in (-1, 1):
        box(bm, J["x0"], J["x1"], d_top - 0.11, d_top - 0.045, J["z"] + sz * (J["w"] / 2 - 0.1) - 0.04, J["z"] + sz * (J["w"] / 2 - 0.1) + 0.04, m=m["FW_PlankDark"])
        for px in (J["x1"] - 0.12, (J["x0"] + J["x1"]) / 2 + 0.1):
            cylinder(bm, W(px, water - 0.6, J["z"] + sz * (J["w"] / 2 - 0.05)), W(px, d_top + (0.32 if px > J["x1"] - 0.3 and sz < 0 else 0.02), J["z"] + sz * (J["w"] / 2 - 0.05)), 0.055, 8, m=m["FW_Bark"], cap_m=m["FW_WoodCut"])
    lathe(bm, J["x1"] - 0.12, J["z"] - J["w"] / 2 + 0.05, [(0.06, d_top + 0.12), (0.1, d_top + 0.12), (0.1, d_top + 0.2), (0.06, d_top + 0.2)], segs=10, m=m["FW_Rope"])
    make_object("Forest_Jetty", bm, M, coll)

    bm = bmesh.new()
    Rk = P["rodRack"]
    for sx in (-1, 1):
        cylinder(bm, W(Rk["x"] + sx * 0.3, -0.05, Rk["z"]), W(Rk["x"] + sx * 0.3, 1.15, Rk["z"]), 0.03, 6, m=m["FW_PlankDark"])
    for y in (0.45, 1.05):
        cylinder(bm, W(Rk["x"] - 0.36, y, Rk["z"]), W(Rk["x"] + 0.36, y, Rk["z"]), 0.022, 5, m=m["FW_PlankDark"])
    for k in range(3):
        rx = Rk["x"] - 0.2 + k * 0.2
        cylinder(bm, W(rx, 0.02, Rk["z"] + 0.2), W(rx + 0.03, 1.75, Rk["z"] - 0.06), 0.012, 4, m=m["FW_Log"], r_end=0.005)
        cylinder(bm, W(rx, 0.3, Rk["z"] + 0.17), W(rx, 0.38, Rk["z"] + 0.15), 0.03, 6, m=m["FW_Iron"])
    Nt = P["nets"]
    hl = Nt["len"] / 2
    for sz in (-1, 1):
        cylinder(bm, W(Nt["x"], -0.05, Nt["z"] + sz * hl), W(Nt["x"], 1.4, Nt["z"] + sz * hl), 0.03, 6, m=m["FW_Bark"])
    cylinder(bm, W(Nt["x"], 1.36, Nt["z"] - hl - 0.06), W(Nt["x"], 1.36, Nt["z"] + hl + 0.06), 0.02, 5, m=m["FW_Bark"])
    verts = [[bm.verts.new(W(Nt["x"] + 0.05 * math.sin(i * 1.3 + j), 1.34 - 0.95 * i / 5 * (0.82 + 0.18 * math.cos(j * 1.7)), Nt["z"] - hl + 0.06 + (2 * hl - 0.12) * j / 6)) for j in range(7)] for i in range(6)]
    for i in range(5):
        for j in range(6):
            if (i + j) % 2 == 0 or i < 2:
                bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1])).material_index = m["FW_Net"]
    floats = [(j, verts[5][j].co.x, verts[5][j].co.z - 0.02, -verts[5][j].co.y) for j in range(0, 7, 2)]
    for j, fx, fy, fz in floats:
        blob(bm, fx, fy, fz, 0.035, 0.035, 0.035, m=m["FW_Red"] if j % 4 else m["FW_Cloth"], cuts=1)

    # --- Bramble's garden: three hives on a bench, the vegetable patch in wattle, the wheelbarrow,
    # the washing line, the rope swing's leaning tree
    hv = P["hives"]
    box(bm, hv[0][0] - 0.3, hv[-1][0] + 0.3, 0.22, 0.27, hv[0][1] - 0.22, hv[0][1] + 0.26, m=m["FW_PlankDark"])
    for hx in (hv[0][0] - 0.2, hv[-1][0] + 0.2):
        box(bm, hx - 0.04, hx + 0.04, -0.1, 0.22, hv[0][1] - 0.18, hv[0][1] + 0.22, m=m["FW_PlankDark"])
    for k, (x, z) in enumerate(hv):
        tiers = 2 + (k % 2)
        for t in range(tiers):
            box(bm, x - 0.19, x + 0.19, 0.27 + t * 0.2, 0.455 + t * 0.2, z - 0.17, z + 0.17, m=m["FW_Hive"] if (t + k) % 2 else m["FW_Cloth"])
        y = 0.27 + tiers * 0.2
        slab(bm, [(x - 0.24, z - 0.22), (x + 0.24, z - 0.22), (x + 0.24, z + 0.22), (x - 0.24, z + 0.22)], y - 0.005, y + 0.05, m=m["FW_Roof"])
        box(bm, x - 0.07, x + 0.07, 0.29, 0.31, z + 0.17, z + 0.2, m=m["FW_Iron"])
    Pt = P["patch"]
    x0, x1, z0, z1 = Pt["x"] - Pt["w"] / 2, Pt["x"] + Pt["w"] / 2, Pt["z"] - Pt["d"] / 2, Pt["z"] + Pt["d"] / 2
    for r_ in range(4):
        zr = z0 + 0.22 + r_ * (Pt["d"] - 0.44) / 3
        slab(bm, rounded_rect(x0 + 0.12, x1 - 0.12, zr - 0.13, zr + 0.13, 0.1, 3), -0.05, 0.07, m=m["FW_Soil"])
        for c_ in range(5):
            x = x0 + 0.26 + c_ * (Pt["w"] - 0.52) / 4 + rng.uniform(-0.03, 0.03)
            if r_ == 0:
                blob(bm, x, 0.15, zr, 0.1, 0.09, 0.1, m=m["FW_Leafy"], cuts=2, noise=0.18, rng=rng)
            elif r_ == 1:
                for q in range(3):
                    cylinder(bm, W(x, 0.05, zr), W(x + (q - 1) * 0.05, 0.24 + 0.04 * q, zr + (q - 1) * 0.03), 0.012, 3, m=m["FW_Tuft"], r_end=0.004)
            elif r_ == 2 and c_ % 2 == 0:
                blob(bm, x, 0.15, zr, 0.13, 0.1, 0.13, m=m["FW_Pumpkin"], cuts=2, n=2.0)
                cylinder(bm, W(x, 0.23, zr), W(x + 0.02, 0.29, zr), 0.012, 4, m=m["FW_MossDeep"])
            elif r_ == 3:
                cylinder(bm, W(x, 0.05, zr), W(x, 0.55, zr), 0.01, 4, m=m["FW_PlankDark"])
                blob(bm, x, 0.32, zr, 0.07, 0.16, 0.07, m=m["FW_Leafy"], cuts=2, noise=0.2, rng=rng)
                blob(bm, x + 0.05, 0.3, zr + 0.04, 0.03, 0.03, 0.03, m=m["FW_Red"], cuts=1)
    posts = []
    nx, nz = round(Pt["w"] / 0.32), round(Pt["d"] / 0.32)
    posts += [(x0 + (x1 - x0) * k / nx, z0) for k in range(nx)] + [(x1, z0 + (z1 - z0) * k / nz) for k in range(nz)]
    posts += [(x1 - (x1 - x0) * k / nx, z1) for k in range(nx)] + [(x0, z1 - (z1 - z0) * k / nz) for k in range(nz)]
    for k, (px, pz) in enumerate(posts):
        cylinder(bm, W(px, -0.05, pz), W(px, 0.5, pz), 0.022, 5, m=m["FW_Bark"])
        qx, qz = posts[(k + 1) % len(posts)]
        for y_ in (0.14, 0.27, 0.4):
            wob = 0.016 if (k + round(y_ * 10)) % 2 else -0.016
            ox, oz = (0.0, wob) if abs(qx - px) > abs(qz - pz) else (wob, 0.0)
            cylinder(bm, W(px + ox, y_, pz + oz), W(qx + ox, y_, qz + oz), 0.013, 4, m=m["FW_Log"])
    Wb = P["wheelbarrow"]
    slab(bm, [(Wb["x"] - 0.3, Wb["z"] - 0.2), (Wb["x"] + 0.3, Wb["z"] - 0.2), (Wb["x"] + 0.3, Wb["z"] + 0.2), (Wb["x"] - 0.3, Wb["z"] + 0.2)], 0.24, 0.44, m=m["FW_Red"])
    blob(bm, Wb["x"], 0.44, Wb["z"], 0.25, 0.07, 0.16, m=m["FW_Soil"], cuts=2, noise=0.1, rng=rng)
    cylinder(bm, W(Wb["x"] + 0.4, 0.14, Wb["z"] - 0.04), W(Wb["x"] + 0.4, 0.14, Wb["z"] + 0.04), 0.14, 10, m=m["FW_Iron"])
    for sz in (-1, 1):
        cylinder(bm, W(Wb["x"] + 0.4, 0.14, Wb["z"] + sz * 0.05), W(Wb["x"] - 0.62, 0.42, Wb["z"] + sz * 0.2), 0.018, 5, m=m["FW_PlankDark"])
        cylinder(bm, W(Wb["x"] - 0.24, 0.26, Wb["z"] + sz * 0.17), W(Wb["x"] - 0.26, -0.02, Wb["z"] + sz * 0.17), 0.018, 5, m=m["FW_PlankDark"])
    Ws = P["washing"]
    (ax_, az_), (bx_, bz_) = Ws["a"], Ws["b"]
    for px, pz in ((ax_, az_), (bx_, bz_)):
        cylinder(bm, W(px, -0.05, pz), W(px, 1.7, pz), 0.035, 6, m=m["FW_PlankDark"])
        cylinder(bm, W(px - 0.14, 1.62, pz), W(px + 0.14, 1.62, pz), 0.02, 5, m=m["FW_PlankDark"])
    line = lambda u: (ax_ + (bx_ - ax_) * u, 1.62 - 0.14 * (1 - (2 * u - 1) ** 2), az_ + (bz_ - az_) * u)
    for k in range(8):
        cylinder(bm, W(*line(k / 8)), W(*line((k + 1) / 8)), 0.006, 4, m=m["FW_Rope"])
    for u0, w_, drop, mat in ((0.12, 0.2, 0.5, "FW_Cloth"), (0.4, 0.14, 0.34, "FW_Red"), (0.62, 0.24, 0.55, "FW_Cloth")):
        p0, p1 = line(u0), line(u0 + w_)
        vs = [bm.verts.new(W(*p0)), bm.verts.new(W(*p1)), bm.verts.new(W(p1[0], p1[1] - drop, p1[2] + 0.03)), bm.verts.new(W(p0[0], p0[1] - drop, p0[2] + 0.03))]
        bm.faces.new(vs).material_index = m[mat]
    Rs = P["ropeSwing"]
    tx, tz = Rs["tree"]
    tip = (Rs["x"] + 0.12, Rs["branch"] + 0.02, Rs["z"] + 0.18)
    mid = (tx + (tip[0] - tx) * 0.45, 1.7, tz + (tip[2] - tz) * 0.45)
    cylinder(bm, W(tx, -0.1, tz), W(*mid), 0.19, 9, m=m["FW_Bark"], r_end=0.13, wobble=0.08, rng=rng)
    cylinder(bm, W(*mid), W(tip[0] + 0.25, tip[1] + 0.45, tip[2] + 0.35), 0.13, 8, m=m["FW_Bark"], r_end=0.05)
    cylinder(bm, W(*mid), W(mid[0] - 0.5, 2.7, mid[2] - 0.2), 0.08, 6, m=m["FW_Bark"], r_end=0.03)
    for k, (dx, dy, dz, r) in enumerate(((0.3, 0.75, 0.4, 0.6), (-0.45, 1.15, -0.2, 0.55), (0.0, 1.2, 0.1, 0.6), (0.65, 0.55, 0.75, 0.42))):
        blob(bm, mid[0] + dx, mid[1] + dy + 0.35, mid[2] + dz, r, r * 0.62, r, m=m["FW_Leafy"] if k % 2 else m["FW_MossDeep"], cuts=3, noise=0.14, rng=rng)

    # --- the south verge: Bramble's seasoned timber stacked under a lean-to roof
    T = P["timber"]
    x0, x1, z0, z1 = T["x"] - T["w"] / 2, T["x"] + T["w"] / 2, T["z"] - T["d"] / 2, T["z"] + T["d"] / 2
    for px in (x0 + 0.05, x1 - 0.05):
        cylinder(bm, W(px, -0.05, z1 - 0.05), W(px, 1.5, z1 - 0.05), 0.04, 6, m=m["FW_PlankDark"])
        cylinder(bm, W(px, -0.05, z0 + 0.05), W(px, 1.22, z0 + 0.05), 0.04, 6, m=m["FW_PlankDark"])
    before = set(bm.faces)
    slab(bm, [(x0 - 0.14, z0 - 0.14), (x1 + 0.14, z0 - 0.14), (x1 + 0.14, z1 + 0.14), (x0 - 0.14, z1 + 0.14)], 0.0, 0.05, m=m["FW_Roof"])
    for v in {v for f in faces_since(bm, before) for v in f.verts}:
        v.co.z += 1.21 + (-(v.co.y) - (z0 - 0.14)) / (z1 - z0 + 0.28) * 0.3
    for row in range(4):
        cnt = 7 - row % 2
        for k in range(cnt):
            lx = x0 + 0.2 + (k + 0.5 * (row % 2)) * (T["w"] - 0.4) / 6.5
            r = 0.105 + 0.012 * ((k * 3 + row) % 3)
            cylinder(bm, W(lx, 0.11 + row * 0.2, z0 + 0.12), W(lx, 0.11 + row * 0.2, z1 - 0.12), r, 8, m=m["FW_Log"] if (k + row) % 3 else m["FW_Bark"], cap_m=m["FW_WoodCut"])
    make_object("Forest_Garden", bm, M, coll, lift="parts")

    # the rope swing's plank on its two ropes: its origin on the branch it hangs from
    land = lift_at(Rs["x"], Rs["z"])
    s_top = cushions["swing"]["top"]
    bm = bmesh.new()
    box(bm, Rs["x"] - 0.11, Rs["x"] + 0.11, s_top - 0.035, s_top, Rs["z"] - 0.3, Rs["z"] + 0.3, m=m["FW_Plank"])
    for sz in (-1, 1):
        cylinder(bm, W(Rs["x"], s_top - 0.04, Rs["z"] + sz * 0.24), W(Rs["x"], Rs["branch"], Rs["z"] + sz * 0.1), 0.014, 5, m=m["FW_Rope"])
    for v in bm.verts:
        v.co.z += land
    make_object("Prop_RopeSwing", bm, M, coll, origin=(Rs["x"], Rs["branch"] + land, Rs["z"]))


def build_brook(L, coll):
    """What stands in and along the brook (its bed is the ground's own, its water the river's sheet):
    mossy rocks round the spring, stepping stones, the log bridge where the river trail crosses
    (flush with the banks: the ground under it is not cut), stones and reeds along its banks, a rock
    step where it tumbles. All of it walked through but the bridge's logs (walked over)."""
    if "brook" not in L:
        return
    Bk = L["brook"]
    rng = random.Random(8086)
    M = ["FW_Stone", "FW_StoneDark", "FW_Moss", "FW_Pebble", "FW_Bark", "FW_WoodCut", "FW_Tuft", "FW_MossDeep", "FW_Fern"]
    m = {name: i for i, name in enumerate(M)}
    bm = bmesh.new()
    F = brook_frame(L, 8)

    def rock(x, z, s, mat, moss=False):
        y = ground_y(x, z)
        blob(bm, x, y + 0.07 * s, z, 0.2 * s, 0.13 * s, 0.17 * s, m=mat, cuts=2, noise=0.12, rng=rng, flat_bottom=y - 0.08)
        if moss:
            blob(bm, x, y + 0.19 * s, z, 0.14 * s, 0.035, 0.12 * s, m=m["FW_Moss"], cuts=2, noise=0.2, rng=rng)

    # the spring: rocks round its head (uphill), the water welling out between them
    x0, z0, w0, tx0, tz0, nx0, nz0 = F[0]
    for k in range(6):
        ang = math.radians(-100 + 40 * k)
        rx = x0 - tx0 * 0.2 + (math.cos(ang) * tx0 - math.sin(ang) * nx0) * -(w0 + 0.22)
        rz = z0 - tz0 * 0.2 + (math.cos(ang) * tz0 - math.sin(ang) * nz0) * -(w0 + 0.22)
        rock(rx, rz, rng.uniform(1.0, 1.5), m["FW_Stone"] if k % 2 else m["FW_StoneDark"], moss=k % 2 == 0)
    # the stepping stones: three flat stones across the bed at each place
    for sx, sz in Bk["stones"]:
        d, w = brook_dist(L, sx, sz)
        near = min(F, key=lambda f: math.hypot(f[0] - sx, f[1] - sz))
        nx, nz = near[5], near[6]
        for k in (-1, 0, 1):
            px, pz = near[0] + nx * k * 0.34 + near[3] * 0.06 * k, near[1] + nz * k * 0.34 + near[4] * 0.06 * k
            y = ground_y(px, pz)
            blob(bm, px, y + 0.07, pz, 0.17, 0.06, 0.15, m=m["FW_Stone"] if k else m["FW_StoneDark"], cuts=2, n=3.0, noise=0.06, rng=rng, flat_bottom=y - 0.04)
    # the log bridge: three logs side by side across the brook, along the trail's way over it
    br = Bk["bridge"]
    near = min(F, key=lambda f: math.hypot(f[0] - br["x"], f[1] - br["z"]))
    tx, tz, nx, nz = near[3], near[4], near[5], near[6]
    y = land_y(br["x"], br["z"])
    for k in (-1, 0, 1):
        cx, cz = br["x"] + tx * k * 0.27, br["z"] + tz * k * 0.27
        ln = 0.85 + 0.06 * k
        cylinder(bm, W(cx - nx * ln, y - 0.045, cz - nz * ln), W(cx + nx * ln, y - 0.045, cz + nz * ln), 0.14, 9, m=m["FW_Bark"], cap_m=m["FW_WoodCut"], wobble=0.05, rng=rng)
    for side in (-1, 1):
        rock(br["x"] + nx * side * 0.95 + tx * 0.5, br["z"] + nz * side * 0.95 + tz * 0.5, 0.9, m["FW_StoneDark"], moss=True)
    # along its banks: stones, mossy ones among them, and reeds; a rock either side where it tumbles
    for i, (x, z, w, tx, tz, nx, nz) in enumerate(F[2:-3]):
        if brook_open(L, x, z) < 1.0 or any(math.hypot(x - sx, z - sz) < 0.6 for sx, sz in Bk["stones"]):
            continue
        for side in (-1, 1):
            if rng.random() < 0.5:
                off = w + rng.uniform(0.18, 0.34)
                rock(x + nx * side * off, z + nz * side * off, rng.uniform(0.45, 0.85), m["FW_Stone"] if (i + side) % 3 else m["FW_StoneDark"], moss=rng.random() < 0.4)
            elif rng.random() < 0.5:
                off = w + rng.uniform(0.3, 0.5)
                rx, rz = x + nx * side * off, z + nz * side * off
                gy = ground_y(rx, rz)
                for q in range(4):
                    a = rng.random() * 6.28
                    cylinder(bm, W(rx + math.cos(a) * 0.05, gy - 0.02, rz + math.sin(a) * 0.05), W(rx + math.cos(a) * 0.12, gy + rng.uniform(0.28, 0.5), rz + math.sin(a) * 0.12), 0.014, 3, m=m["FW_Tuft"], r_end=0.003)
        if i % 3 == 0:
            for _ in range(2):
                px, pz = x + nx * rng.uniform(-w, w) * 0.8, z + nz * rng.uniform(-w, w) * 0.8
                gy = ground_y(px, pz)
                blob(bm, px, gy + 0.012, pz, rng.uniform(0.04, 0.07), 0.03, rng.uniform(0.035, 0.06), m=m["FW_Pebble"], cuts=1, flat_bottom=gy - 0.02)
    make_object("Forest_Brook", bm, M, coll)


def build_adit(L, bm, rng):
    """The old mine adit down to the Glimmering Caverns, behind the Autumn Maples on the western cliff:
    a mossy outcrop, a timber-framed portal onto the dark (facing into the wood, +x) recessed 1.5 m
    into an alcove of the rock (its two mossy wings reaching out either side), vines hanging over its
    lintel, ferns crowding its foot, a lantern on its post, the old rails sinking under the grass; no
    road to it: the meadow runs on unbroken, strewn with fallen maple leaves and woodland stones.
    (Materials as build_structures': 0 bark, 1 log, 3 plank, 4 plank dark, 6 window, 7 iron, 8 stone,
    13 pine needle, 14 moss, 15 maple leaf.)"""
    A = L["adit"]
    O = A["outcrop"]
    AC = A["alcove"]
    x, z, hw, h = A["x"], A["z"], A["w"] / 2, A["h"]
    face = O["x1"]
    front = face + AC["depth"]
    # the alcove's wings: rough stone either side of the portal, reaching 1.5 m into the wood, mossy
    # on top, lower toward their ends
    for sz in (-1, 1):
        z_in = z + sz * AC["half"]
        z_out = O["z0"] if sz < 0 else O["z1"]
        for k in range(5):
            t = (k + 0.5) / 5
            bx = face + (front - face) * t
            bz = z_in + (z_out - z_in) * (0.35 + 0.3 * rng.random())
            top = O["h"] * (0.95 - 0.45 * t)
            blob(bm, bx, top * 0.5, bz, 0.42 + 0.12 * rng.random(), top * 0.55, abs(z_out - z_in) * 0.55, m=8, cuts=3, noise=0.28, rng=rng, flat_bottom=-0.1)
            blob(bm, bx, top * 0.98, bz, 0.4, 0.12, abs(z_out - z_in) * 0.45, m=14, cuts=2, noise=0.3, rng=rng)
    # ferns and bushes at the wings' ends, where the alcove opens into the wood
    for sz in (-1, 1):
        for k in range(3):
            blob(bm, front + 0.05 + 0.2 * rng.random(), 0.28 + 0.1 * k, z + sz * (AC["half"] + 0.2 + 0.3 * k), 0.34, 0.3, 0.3, m=13, cuts=2, noise=0.35, rng=rng, flat_bottom=0.0)
    # fallen maple leaves and woodland stones where the road used to run (the maples are just east)
    for k in range(46):
        lx = front + 0.2 + 4.6 * rng.random()
        lz = z - 1.9 + 3.8 * rng.random()
        blob(bm, lx, 0.012, lz, 0.07 + 0.04 * rng.random(), 0.008, 0.05 + 0.03 * rng.random(), m=15, cuts=1)
    for k in range(7):
        sx = front + 0.4 + 4.0 * rng.random()
        sz_ = z - 1.8 + 3.6 * rng.random()
        blob(bm, sx, 0.04, sz_, 0.12 + 0.08 * rng.random(), 0.07, 0.1 + 0.06 * rng.random(), m=8, cuts=2, noise=0.3, rng=rng, flat_bottom=0.0)
    # the outcrop: a heap of rough stone, taller at the back, its face open round the portal
    for k in range(9):
        bx = O["x0"] + (O["x1"] - O["x0"]) * (0.25 + 0.3 * rng.random())
        bz = O["z0"] + (O["z1"] - O["z0"]) * (k + 0.5) / 9
        if abs(bz - z) < hw + 0.2:
            bx = O["x0"] + 0.25
        blob(bm, bx, O["h"] * (0.35 + 0.2 * rng.random()), bz, 0.55 + 0.2 * rng.random(), O["h"] * (0.4 + 0.2 * rng.random()), 0.5 + 0.15 * rng.random(), m=8, cuts=3, noise=0.28, rng=rng, flat_bottom=-0.1)
    for sz in (-1, 1):
        blob(bm, face - 0.3, 1.1, z + sz * (hw + 0.55), 0.45, 1.15, 0.42, m=8, cuts=3, noise=0.25, rng=rng, flat_bottom=-0.1)
    blob(bm, O["x0"] + 0.5, O["h"] - 0.2, z, 0.9, 0.45, 1.3, m=8, cuts=3, noise=0.3, rng=rng)
    # moss over its top
    for k in range(7):
        blob(bm, O["x0"] + 0.3 + 0.6 * rng.random(), O["h"] * (0.75 + 0.2 * rng.random()), O["z0"] + (O["z1"] - O["z0"]) * rng.random(), 0.35, 0.12, 0.3, m=14, cuts=2, noise=0.3, rng=rng)
    # the dark: a recess back into the rock
    box(bm, face - 0.75, face + 0.02, 0.0, h - 0.05, z - hw + 0.08, z + hw - 0.08, m=7)
    # the timber frame: two posts, a heavy lintel, braces
    for sz in (-1, 1):
        cylinder(bm, W(face + 0.05, -0.05, z + sz * hw), W(face + 0.05, h + 0.05, z + sz * hw), 0.1, 8, m=1, cap_m=4, wobble=0.05, rng=rng)
        cylinder(bm, W(face + 0.05, h - 0.55, z + sz * (hw - 0.05)), W(face + 0.05, h - 0.1, z + sz * (hw - 0.45)), 0.05, 6, m=4)
    cylinder(bm, W(face + 0.05, h + 0.02, z - hw - 0.25), W(face + 0.05, h + 0.02, z + hw + 0.25), 0.13, 8, m=1, cap_m=4, wobble=0.05, rng=rng)
    # an old warning board, askew over the top of the opening
    q = [W(face + 0.12, h - 0.35, z - hw + 0.1), W(face + 0.12, h - 0.15, z + hw - 0.1), W(face + 0.12, h - 0.03, z + hw - 0.1), W(face + 0.12, h - 0.23, z - hw + 0.1)]
    hexa(bm, q, Vector((0.04, 0, 0)), m=3, m_under=4)
    # vines hanging over the lintel, leaves along them
    for k in range(11):
        vz = z - hw - 0.2 + (2 * hw + 0.4) * k / 10
        ln = 0.35 + 0.8 * rng.random()
        cylinder(bm, W(face + 0.12, h + 0.08, vz), W(face + 0.15, h + 0.08 - ln, vz + 0.04 * (rng.random() - 0.5)), 0.015, 5, m=13)
        for j in range(3):
            ly = h + 0.02 - ln * (j + 1) / 3.5
            blob(bm, face + 0.15, ly, vz + 0.03 * (rng.random() - 0.5), 0.05, 0.035, 0.05, m=13, cuts=1)
    # bushes crowding the portal's sides (its camouflage)
    for sz in (-1, 1):
        for k in range(3):
            blob(bm, face + 0.05 + 0.15 * rng.random(), 0.3 + 0.15 * k, z + sz * (hw + 0.35 + 0.25 * k), 0.34, 0.32, 0.3, m=13, cuts=2, noise=0.35, rng=rng, flat_bottom=0.0)
    # a lantern on the south post
    ly = h - 0.6
    lx, lz = face + 0.24, z + hw
    cylinder(bm, W(face + 0.1, ly + 0.2, lz), W(lx, ly + 0.2, lz), 0.012, 5, m=7)
    lathe(bm, lx, lz, [(0, 0.0), (0.06, 0.0), (0.07, 0.1), (0.05, 0.14), (0, 0.15)], segs=10, m=6, y0=ly)
    lathe(bm, lx, lz, [(0, 0.12), (0.075, 0.12), (0.03, 0.18), (0, 0.19)], segs=10, m=7, y0=ly)
    # the old rails out of the dark, sinking under the grass before the alcove's mouth
    for k in range(4):
        rx = face - 0.5 + k * 0.42
        box(bm, rx, rx + 0.12, 0.0, 0.035, z - 0.42, z + 0.42, m=4)
    for sz in (-0.28, 0.28):
        box(bm, face - 0.7, face + 0.9, 0.03, 0.06, z + sz - 0.025, z + sz + 0.025, m=7)


# ---------------------------------------------------------------------------------------------
# the felling trees: each kind's four looks, at the origin, pivot at the trunk's foot


def stump(bm, r, h, rng, bark=0, cut=1, roots=4):
    cylinder(bm, W(0, -0.05, 0), W(0, h, 0), r, 14, m=bark, cap_m=cut, wobble=0.07, rng=rng)
    lathe(bm, 0, 0, [(0, 0.0), (r * 0.7, 0.0), (r * 0.7, 0.006), (0, 0.006)], segs=14, m=bark, y0=h)  # a growth ring
    lathe(bm, 0, 0, [(0, 0.0), (r * 0.35, 0.0), (r * 0.35, 0.01), (0, 0.01)], segs=10, m=cut, y0=h)
    for k in range(roots):
        a = 2 * math.pi * k / roots + rng.random() * 0.5
        cylinder(bm, W(math.cos(a) * r * 0.6, h * 0.35, math.sin(a) * r * 0.6), W(math.cos(a) * r * 1.6, -0.03, math.sin(a) * r * 1.6), r * 0.3, 7, m=bark, r_end=r * 0.1)


def sprout(bm, h, leaf, stem):
    cylinder(bm, W(0, 0, 0), W(0.01, h, 0), 0.015, 6, m=stem, r_end=0.008)
    for sx in (-1, 1):
        blob(bm, sx * 0.06, h * 0.85, 0.0, 0.06, 0.012, 0.035, m=leaf, cuts=2)
    blob(bm, 0.0, h + 0.03, 0.0, 0.03, 0.04, 0.03, m=leaf, cuts=1)
    blob(bm, 0.0, 0.01, 0.0, 0.12, 0.02, 0.12, m=stem, cuts=1)  # the little mound of earth round it


def cone_tree(bm, s, rng, tiers, bark, needle, needle_light, trunk_r=0.16, trunk_h=0.8):
    lathe(bm, 0, 0, [(0, 0.0), (trunk_r * s, 0.0), (trunk_r * 0.85 * s, trunk_h * s), (0, (trunk_h + 0.05) * s)], segs=10, m=bark, jitter=0.1, rng=rng)
    yaw = rng.random() * 3
    for k, (rad, base, tall) in enumerate(tiers):
        R, y0, H = rad * s, base * s, tall * s
        prof = [(0, y0), (R * 0.95, y0 + 0.02 * s), (R, y0 + 0.1 * s), (R * 0.72, y0 + 0.28 * H), (R * 0.4, y0 + 0.6 * H), (0, y0 + H)]
        lathe(bm, 0, 0, prof, segs=12, m=needle_light if k % 2 else needle, yaw=yaw + k, jitter=0.06, rng=rng)


def birch_tree(bm, s, rng):
    # a slender white trunk, dark marks round it, a light crown of round clumps
    h = 2.7 * s
    lathe(bm, 0, 0, [(0, 0.0), (0.13 * s, 0.0), (0.1 * s, h * 0.6), (0.06 * s, h), (0, h + 0.02)], segs=10, m=0, jitter=0.05, rng=rng)
    for k in range(int(7 * s) + 2):
        y = 0.2 * s + k * 0.3 * s
        if y > h * 0.8:
            break
        a = rng.random() * 6.28
        r = 0.12 * s * (1 - y / (h * 1.4))
        blob(bm, math.cos(a) * r * 0.85, y, math.sin(a) * r * 0.85, 0.06 * s, 0.018 * s, 0.05 * s, m=1, cuts=1)
    for k in range(2):  # two branches up into the crown
        a = k * math.pi + 0.6
        cylinder(bm, W(0, h * 0.55, 0), W(math.cos(a) * 0.45 * s, h * 0.8, math.sin(a) * 0.45 * s), 0.035 * s, 6, m=0, r_end=0.02 * s)
    clumps = [(0.0, h * 0.95, 0.0, 0.75), (0.45, h * 0.8, 0.2, 0.55), (-0.4, h * 0.82, -0.15, 0.55), (0.1, h * 0.72, -0.45, 0.5), (-0.15, h * 0.7, 0.45, 0.5), (0.0, h * 1.12, 0.05, 0.5)]
    for k, (x, y, z, r) in enumerate(clumps):
        blob(bm, x * s, y, z * s, r * s, r * 0.85 * s, r * s, m=2 + (k % 2), cuts=3, noise=0.12, rng=rng)


def maple_tree(bm, s, rng):
    h = 1.6 * s
    lathe(bm, 0, 0, [(0, 0.0), (0.22 * s, 0.0), (0.16 * s, h * 0.7), (0.12 * s, h), (0, h + 0.02)], segs=10, m=0, jitter=0.08, rng=rng)
    for k in range(3):
        a = k * 2.1 + 0.3
        cylinder(bm, W(0, h * 0.8, 0), W(math.cos(a) * 0.7 * s, h * 1.25, math.sin(a) * 0.7 * s), 0.07 * s, 7, m=0, r_end=0.035 * s)
    for k in range(3):  # buttress roots
        a = k * 2.1 + 1.2
        cylinder(bm, W(math.cos(a) * 0.1 * s, 0.25 * s, math.sin(a) * 0.1 * s), W(math.cos(a) * 0.45 * s, -0.03, math.sin(a) * 0.45 * s), 0.09 * s, 7, m=0, r_end=0.03 * s)
    # a broad round crown in autumn gold, orange and red
    clumps = [(0.0, 2.35, 0.0, 1.0), (0.85, 2.0, 0.3, 0.72), (-0.8, 2.05, -0.2, 0.75), (0.2, 1.95, -0.85, 0.68), (-0.25, 1.95, 0.85, 0.7), (0.45, 2.75, -0.2, 0.62), (-0.4, 2.7, 0.35, 0.6)]
    for k, (x, y, z, r) in enumerate(clumps):
        blob(bm, x * s, y * s, z * s, r * s, r * 0.8 * s, r * s, m=1 + (k % 3), cuts=3, noise=0.14, rng=rng)


def elder_tree(bm, s, rng):
    # a huge gnarled trunk twisting up, great roots, a vast teal crown with glowing leaves and wisps
    h = 2.2 * s
    segs = 8
    prev = (0.0, 0.0, 0.0)
    for k in range(segs):
        t = (k + 1) / segs
        x, z = 0.12 * s * math.sin(t * 5.0), 0.1 * s * math.cos(t * 4.0)
        cur = (x, h * t, z)
        r0 = (0.55 - 0.3 * (k / segs)) * s
        r1 = (0.55 - 0.3 * t) * s
        cylinder(bm, W(*prev), W(*cur), r0, 12, m=0, r_end=r1, wobble=0.12, rng=rng)
        blob(bm, cur[0], cur[1], cur[2], r1, r1 * 0.6, r1, m=0, cuts=2, noise=0.1, rng=rng)
        prev = cur
    for k in range(6):
        a = k * math.pi / 3 + 0.2
        cylinder(bm, W(math.cos(a) * 0.3 * s, 0.4 * s, math.sin(a) * 0.3 * s), W(math.cos(a) * 1.05 * s, 0.02, math.sin(a) * 1.05 * s), 0.26 * s, 8, m=0, r_end=0.13 * s)
        blob(bm, math.cos(a) * 1.1 * s, 0.04, math.sin(a) * 1.1 * s, 0.16 * s, 0.1 * s, 0.16 * s, m=0, cuts=2, noise=0.1, rng=rng)
    for k in range(4):
        a = k * math.pi / 2 + 0.5
        cylinder(bm, W(prev[0], h * 0.92, prev[2]), W(math.cos(a) * 1.1 * s, h * 1.3, math.sin(a) * 1.1 * s), 0.16 * s, 8, m=0, r_end=0.07 * s)
    clumps = [(0.0, 3.4, 0.0, 1.5), (1.25, 2.95, 0.4, 1.05), (-1.2, 3.0, -0.3, 1.1), (0.3, 2.9, -1.25, 1.0), (-0.35, 2.95, 1.2, 1.0), (0.6, 4.0, 0.3, 0.9), (-0.55, 3.95, -0.4, 0.85)]
    for k, (x, y, z, r) in enumerate(clumps):
        blob(bm, x * s, y * s, z * s, r * s, r * 0.78 * s, r * s, m=1, cuts=3, noise=0.13, rng=rng)
    # glowing leaves peeking out of the crown, and wisps drifting round it
    for k in range(16):
        x, y, z, r = clumps[k % len(clumps)]
        a = rng.random() * 6.28
        e = rng.uniform(-0.3, 0.5)
        px, py, pz = x + math.cos(a) * r * 0.95, y + e * r * 0.7, z + math.sin(a) * r * 0.95
        blob(bm, px * s, py * s, pz * s, 0.14 * s, 0.1 * s, 0.14 * s, m=2, cuts=1)
    for k in range(7):
        a = k * 0.9
        blob(bm, math.cos(a) * 2.0 * s, (2.2 + 0.6 * math.sin(k * 1.7)) * s, math.sin(a) * 2.0 * s, 0.06 * s, 0.06 * s, 0.06 * s, m=3, cuts=1)


def build_trees(coll):
    """Tree_<kind>_<stage>: every kind's stump, sprout, sapling and mature looks."""
    out = []
    for kind in TREE_KINDS:
        for stage in STAGES:
            rng = random.Random(TREE_KINDS.index(kind) * 10 + STAGES.index(stage))
            bm = bmesh.new()
            if kind == "soft_pine":
                mats = ["FW_PineBark", "FW_WoodCut", "FW_PineNeedle", "FW_PineNeedleLight"]
                if stage == "stump":
                    stump(bm, 0.17, 0.26, rng)
                elif stage == "sprout":
                    sprout(bm, 0.22, 2, 0)
                else:
                    s = 0.45 if stage == "sapling" else 1.05
                    cone_tree(bm, s, rng, ((1.0, 0.5, 1.1), (0.78, 1.15, 1.0), (0.55, 1.75, 0.95)), 0, 2, 3)
            elif kind == "birch":
                mats = ["FW_BirchBark", "FW_BirchMark", "FW_BirchLeaf", "FW_BirchLeafLight", "FW_WoodCut"]
                if stage == "stump":
                    stump(bm, 0.14, 0.3, rng, bark=0, cut=4, roots=3)
                elif stage == "sprout":
                    sprout(bm, 0.24, 2, 0)
                else:
                    birch_tree(bm, 0.45 if stage == "sapling" else 1.15, rng)
            elif kind == "cedar":
                mats = ["FW_CedarBark", "FW_WoodCut", "FW_CedarNeedle", "FW_CedarNeedleLight"]
                if stage == "stump":
                    stump(bm, 0.22, 0.3, rng)
                elif stage == "sprout":
                    sprout(bm, 0.26, 2, 0)
                else:
                    s = 0.45 if stage == "sapling" else 1.2
                    cone_tree(bm, s, rng, ((0.95, 0.8, 1.0), (0.8, 1.4, 0.95), (0.64, 1.95, 0.9), (0.46, 2.45, 0.85), (0.28, 2.9, 0.8)), 0, 2, 3, trunk_r=0.2, trunk_h=1.0)
            elif kind == "maple":
                mats = ["FW_MapleBark", "FW_MapleLeaf", "FW_MapleLeafGold", "FW_MapleLeafRed", "FW_WoodCut"]
                if stage == "stump":
                    stump(bm, 0.26, 0.3, rng, bark=0, cut=4)
                elif stage == "sprout":
                    sprout(bm, 0.24, 1, 0)
                else:
                    maple_tree(bm, 0.45 if stage == "sapling" else 1.15, rng)
            else:
                mats = ["FW_ElderBark", "FW_ElderLeaf", "FW_ElderLeafGlow", "FW_Wisp", "FW_WoodCut"]
                if stage == "stump":
                    stump(bm, 0.5, 0.42, rng, bark=0, cut=4, roots=6)
                    blob(bm, 0.0, 0.47, 0.0, 0.07, 0.07, 0.07, m=2, cuts=1)  # a glowing shoot already
                elif stage == "sprout":
                    sprout(bm, 0.3, 2, 0)
                else:
                    elder_tree(bm, 0.45 if stage == "sapling" else 1.05, rng)
            ob = make_object(f"Tree_{kind}_{stage}", bm, mats, coll)
            out.append(ob.name)
    return out


# ---------------------------------------------------------------------------------------------
# the animals


def fauna_node(name, parts, coll, pivot=(0.0, 0.0, 0.0)):
    """`parts`: [(bmesh-building function, colour hex)] into one vertex-coloured node whose origin is
    the game point `pivot` (a wing's shoulder, the body's feet)."""
    bm = bmesh.new()
    col = None
    colours = []
    for build, hexc in parts:
        before = set(bm.faces)
        build(bm)
        colours.append((set(bm.faces) - before, hexc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    for faces, hexc in colours:
        rgba = (*lin(hexc), 1.0)
        for f in faces:
            f.material_index = 0
            for loop in f.loops:
                loop[col] = rgba
    shift = W(*pivot)
    for v in bm.verts:
        v.co -= shift
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("FW_Clay"))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location = W(*pivot)
    return ob


def build_fauna(coll):
    """Fauna_Bird_*: a round little songbird perched at its feet (0, 0, 0), facing +z, its wings
    folded against its sides (their nodes' origins at the shoulders). Fauna_Butterfly_*: a slim body
    and two broad pale wings from its back (origins at the hinge). Pale where the game tints them."""
    # the bird: 0.2 m long; a warm brown back, a pale breast (tinted per bird), a gold beak
    fauna_node("Fauna_Bird_Body", [
        (lambda bm: blob(bm, 0.0, 0.085, 0.0, 0.07, 0.065, 0.085, m=0, cuts=3), "#8A6A4E"),
        (lambda bm: blob(bm, 0.0, 0.075, 0.035, 0.055, 0.05, 0.055, m=0, cuts=2), "#F2E6D8"),
        (lambda bm: blob(bm, 0.0, 0.155, 0.045, 0.05, 0.048, 0.05, m=0, cuts=3), "#7A5B42"),
        (lambda bm: blob(bm, 0.0, 0.15, 0.1, 0.014, 0.012, 0.022, m=0, cuts=1), "#E8B84A"),
        (lambda bm: blob(bm, 0.028, 0.165, 0.075, 0.009, 0.009, 0.006, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, -0.028, 0.165, 0.075, 0.009, 0.009, 0.006, m=0, cuts=1), "#1B1818"),
        (lambda bm: blob(bm, 0.0, 0.09, -0.1, 0.03, 0.012, 0.05, m=0, cuts=1), "#5E4632"),
        (lambda bm: cylinder(bm, W(0.02, 0.03, 0.0), W(0.02, 0.0, 0.01), 0.006, 5, m=0), "#C9A06A"),
        (lambda bm: cylinder(bm, W(-0.02, 0.03, 0.0), W(-0.02, 0.0, 0.01), 0.006, 5, m=0), "#C9A06A"),
    ], coll)
    for sx, name in ((1, "Fauna_Bird_WingL"), (-1, "Fauna_Bird_WingR")):
        shoulder = (sx * 0.06, 0.11, 0.01)
        fauna_node(name, [
            (lambda bm, sx=sx: blob(bm, sx * 0.075, 0.095, -0.03, 0.018, 0.045, 0.07, m=0, cuts=2), "#6E5038"),
        ], coll, pivot=shoulder)
    # the butterfly: a dark slim body, two broad rounded wings (upper and lower lobes), pale
    fauna_node("Fauna_Butterfly_Body", [
        (lambda bm: blob(bm, 0.0, 0.0, 0.0, 0.01, 0.01, 0.04, m=0, cuts=2), "#2E2622"),
        (lambda bm: cylinder(bm, W(0.004, 0.005, 0.035), W(0.02, 0.02, 0.06), 0.002, 4, m=0), "#2E2622"),
        (lambda bm: cylinder(bm, W(-0.004, 0.005, 0.035), W(-0.02, 0.02, 0.06), 0.002, 4, m=0), "#2E2622"),
    ], coll)
    for sx, name in ((1, "Fauna_Butterfly_WingL"), (-1, "Fauna_Butterfly_WingR")):
        fauna_node(name, [
            (lambda bm, sx=sx: blob(bm, sx * 0.04, 0.0, 0.012, 0.035, 0.004, 0.03, m=0, cuts=2), "#FFF6E2"),
            (lambda bm, sx=sx: blob(bm, sx * 0.03, 0.0, -0.022, 0.024, 0.004, 0.02, m=0, cuts=2), "#F4E4C8"),
            (lambda bm, sx=sx: blob(bm, sx * 0.05, 0.001, 0.018, 0.008, 0.004, 0.008, m=0, cuts=1), "#3A2E28"),
        ], coll, pivot=(sx * 0.008, 0.0, 0.0))


def build_animals(L, coll):
    # the deer: a chibi doe with little antler nubs, grazing by the path, facing the glen
    a = next(x for x in L["animals"] if x["kind"] == "deer")
    ax, az = a["x"], a["z"]
    bm = bmesh.new()
    # 0 fur, 1 cream, 2 dark, 3 antler, 4 eye
    blob(bm, 0.0, 0.5, 0.0, 0.2, 0.19, 0.34, m=0, cuts=3)
    blob(bm, 0.0, 0.44, 0.05, 0.16, 0.13, 0.27, m=1, cuts=2)  # the pale belly
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = sx * 0.1, sz * 0.22
            cylinder(bm, W(lx, 0.43, lz), W(lx, 0.06, lz + 0.02), 0.05, 7, m=0, r_end=0.034)
            blob(bm, lx, 0.04, lz + 0.03, 0.035, 0.04, 0.04, m=2, cuts=1)
    blob(bm, 0.0, 0.6, -0.34, 0.06, 0.08, 0.05, m=1, cuts=2)  # the tail's white flag
    for k in range(6):  # the dappled spots on her back
        blob(bm, (k % 2 - 0.5) * 0.16, 0.675, -0.2 + k * 0.08, 0.03, 0.01, 0.03, m=1, cuts=1)
    deer = make_object("Animal_Deer", bm, ["FW_DeerFur", "FW_DeerCream", "FW_DeerDark", "FW_Antler", "FW_Eye"], coll, origin=(0.0, 0.0, 0.0))
    deer.location = W(ax, land_y(ax, az), az)
    deer.rotation_euler = (0.0, 0.0, math.radians(-150))
    deer["origin"] = [ax, 0.0, az]
    # her head and neck: pivots where the neck meets the body (she lowers it to graze)
    neck = (0.0, 0.6, 0.27)
    bm = bmesh.new()
    cylinder(bm, W(0.0, 0.58, 0.25), W(0.0, 0.8, 0.38), 0.075, 8, m=0, r_end=0.062)
    blob(bm, 0.0, 0.86, 0.44, 0.115, 0.105, 0.125, m=0, cuts=3)
    blob(bm, 0.0, 0.82, 0.57, 0.062, 0.057, 0.07, m=1, cuts=2)  # the muzzle
    blob(bm, 0.0, 0.83, 0.635, 0.026, 0.02, 0.015, m=2, cuts=1)  # the nose
    for sx in (-1, 1):
        blob(bm, sx * 0.068, 0.9, 0.53, 0.021, 0.026, 0.012, m=4, cuts=1)
        blob(bm, sx * 0.14, 0.97, 0.39, 0.085, 0.036, 0.03, m=0, cuts=2)  # an ear
        blob(bm, sx * 0.14, 0.97, 0.405, 0.052, 0.02, 0.01, m=1, cuts=1)
        cylinder(bm, W(sx * 0.05, 0.96, 0.43), W(sx * 0.08, 1.05, 0.41), 0.015, 6, m=3, r_end=0.01)  # a nub of antler
    # (the head's shapes are built round the deer's own origin; placed at the neck)
    shift = W(*neck)
    for v in bm.verts:
        v.co -= shift
    me = bpy.data.meshes.new("Animal_Deer_HeadMesh")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    for m in ["FW_DeerFur", "FW_DeerCream", "FW_DeerDark", "FW_Antler", "FW_Eye"]:
        me.materials.append(material(m))
    head = bpy.data.objects.new("Animal_Deer_Head", me)
    coll.objects.link(head)
    head.parent = deer
    head.location = W(*neck)
    # the rabbits: three buns round their spot, each its own node (they hop)
    r = next(x for x in L["animals"] if x["kind"] == "rabbits")
    spots = [(-0.3, -0.1, 0.4), (0.35, 0.15, 2.2), (0.0, 0.42, -1.2)]
    for k, (dx, dz, yaw) in enumerate(spots):
        bm = bmesh.new()
        blob(bm, 0.0, 0.13, 0.0, 0.13, 0.12, 0.16, m=0, cuts=3)
        blob(bm, 0.0, 0.1, 0.05, 0.1, 0.08, 0.1, m=1, cuts=2)  # the pale chest
        blob(bm, 0.0, 0.24, 0.12, 0.09, 0.085, 0.085, m=0, cuts=3)  # the head
        for sx in (-1, 1):
            blob(bm, sx * 0.04, 0.37, 0.09, 0.028, 0.08, 0.02, m=0, cuts=2)  # an ear
            blob(bm, sx * 0.04, 0.37, 0.1, 0.014, 0.06, 0.008, m=2, cuts=1)
            blob(bm, sx * 0.045, 0.26, 0.19, 0.014, 0.016, 0.008, m=3, cuts=1)
            blob(bm, sx * 0.07, 0.03, 0.08, 0.035, 0.025, 0.05, m=1, cuts=1)  # a front paw
        blob(bm, 0.0, 0.225, 0.2, 0.014, 0.01, 0.008, m=2, cuts=1)  # the nose
        blob(bm, 0.0, 0.14, -0.16, 0.05, 0.05, 0.05, m=1, cuts=2)  # the cotton tail
        ob = make_object(f"Animal_Rabbit_{k + 1}", bm, ["FW_RabbitFur", "FW_RabbitWhite", "FW_Pink", "FW_Eye"], coll, origin=(0.0, 0.0, 0.0))
        ob.location = W(r["x"] + dx, land_y(r["x"] + dx, r["z"] + dz), r["z"] + dz)
        ob.rotation_euler = (0.0, 0.0, yaw)
        ob["origin"] = [r["x"] + dx, 0.0, r["z"] + dz]


# ---------------------------------------------------------------------------------------------


TREES_COLLECTION = "Forest_Trees"


def build(root):
    purge()
    old = bpy.data.collections.get(TREES_COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    global LAYOUT, TERRAIN
    RIVER_FRAMES.clear()
    L = read_layout(root)
    LAYOUT, TERRAIN = L, read_terrain(root)
    if TERRAIN["half"] != L["half"]:
        raise RuntimeError("forest_terrain.json is stale: run `npm run forest-terrain`")
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    build_ground(L, coll)
    build_water(L, coll)
    build_floors(L, coll)
    build_falls(L, coll)
    build_dressing(L, coll)
    build_deco(L, coll)
    build_rocks(L, coll)
    build_vista(L, coll)
    build_structures(L, cushions, coll)
    build_places(L, cushions, coll)
    build_brook(L, coll)
    build_animals(L, coll)
    build_fauna(coll)
    tcoll = bpy.data.collections.new(TREES_COLLECTION)
    bpy.context.scene.collection.children.link(tcoll)
    trees = build_trees(tcoll)
    return coll, tcoll, L, trees


def build_dressing(L, coll):
    """The dressing pass: what you walk round is in the layout (`dressing`, with its colliders in
    forest.ts): boulders on the hillside and flanking the Mine Ledge's cliff, lantern posts along the
    trails, fallen logs, stumps. The rest is walked through or out of reach, placed by rule: stones
    round the pool at the river's head and at its mouth, log steps up the trails where they climb,
    and the far bank's bushes, boulders, ferns and flowers."""
    rng = random.Random(707)
    half = L["half"]
    D = L["dressing"]
    M = ["FW_Stone", "FW_StoneDark", "FW_Moss", "FW_Bark", "FW_WoodCut", "FW_PlankDark", "FW_Iron", "FW_Window", "FW_Fern", "FW_MushCap", "FW_Petal", "FW_PetalYellow", "FW_PetalBlue", "FW_Tuft"]
    m = {name: i for i, name in enumerate(M)}
    bm = bmesh.new()
    water = L["river"]["water"]

    def nub(x, y, z, r, h, mat):
        lathe(bm, x, z, [(0, y), (r, y + h * 0.15), (r * 0.72, y + h * 0.8), (0, y + h)], segs=6, m=mat, yaw=rng.random())

    def flower(x, z, tone):
        h = 0.12 + 0.09 * rng.random()
        cylinder(bm, W(x, 0.0, z), W(x, h, z), 0.011, 3, m=m["FW_Tuft"])
        nub(x, h - 0.012, z, 0.045, 0.05, m[tone])

    def bush(x, z, s):
        for q in range(2):
            bx, bz = x + 0.28 * (q - 0.5) * s, z + 0.16 * (q - 0.5)
            blob(bm, bx, 0.24 * s, bz, 0.4 * s, 0.32 * s, 0.36 * s, m=m["FW_Fern"], cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
            for _ in range(4):
                a = rng.random() * 6.28
                nub(bx + math.cos(a) * 0.34 * s, 0.24 * s + rng.uniform(-0.06, 0.12) * s, bz + math.sin(a) * 0.3 * s, 0.03, 0.05, m["FW_MushCap"])

    # the hillside's boulders: each a big stone with a smaller one leaning on it and a cap of moss
    for k, (x, z, s) in enumerate(D["boulders"]):
        blob(bm, x, 0.16 * s, z, 0.5 * s, 0.4 * s, 0.44 * s, m=k % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.3)
        blob(bm, x + 0.42 * s, 0.06, z + 0.3 * s, 0.24 * s, 0.17 * s, 0.2 * s, m=(k + 1) % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.2)
        blob(bm, x - 0.02, 0.5 * s, z, 0.32 * s, 0.07 * s, 0.28 * s, m=m["FW_Moss"], cuts=2, noise=0.2, rng=rng)
    # the waist-high shrubs: three lumps each, a few with berries
    for k, (x, z, sz) in enumerate(D["shrubs"]):
        for dx, dz, f in ((0.0, 0.0, 1.0), (0.3, 0.14, 0.72), (-0.26, 0.18, 0.66)):
            blob(bm, x + dx * sz, 0.34 * sz * f, z + dz * sz, 0.44 * sz * f, 0.4 * sz * f, 0.42 * sz * f, m=m["FW_Fern"] if k % 2 else m["FW_Moss"], cuts=3, noise=0.1, rng=rng, flat_bottom=-0.05)
        if k % 3 == 0:
            for _ in range(6):
                a = rng.random() * 6.28
                nub(x + math.cos(a) * 0.38 * sz, 0.3 * sz + rng.uniform(-0.05, 0.2) * sz, z + math.sin(a) * 0.36 * sz, 0.03, 0.05, m["FW_MushCap"])
    # the lantern posts: an iron lantern on a bracket, its glass glowing
    for x, z in D["lanternPosts"]:
        cylinder(bm, W(x, -0.05, z), W(x, 1.5, z), 0.05, 8, m=m["FW_PlankDark"])
        blob(bm, x, 0.03, z, 0.13, 0.06, 0.13, m=m["FW_StoneDark"], cuts=2, noise=0.08, rng=rng, flat_bottom=-0.1)
        cylinder(bm, W(x, 1.42, z), W(x + 0.24, 1.42, z + 0.24), 0.022, 6, m=m["FW_PlankDark"])
        lx, lz = x + 0.24, z + 0.24
        cylinder(bm, W(lx, 1.42, lz), W(lx, 1.33, lz), 0.006, 4, m=m["FW_Iron"])
        box(bm, lx - 0.075, lx + 0.075, 1.31, 1.33, lz - 0.075, lz + 0.075, m=m["FW_Iron"])
        box(bm, lx - 0.075, lx + 0.075, 1.1, 1.12, lz - 0.075, lz + 0.075, m=m["FW_Iron"])
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(bm, lx + sx * 0.066 - 0.009, lx + sx * 0.066 + 0.009, 1.12, 1.31, lz + sz * 0.066 - 0.009, lz + sz * 0.066 + 0.009, m=m["FW_Iron"])
        box(bm, lx - 0.055, lx + 0.055, 1.125, 1.305, lz - 0.055, lz + 0.055, m=m["FW_Window"])
    # the fallen logs: mossy, a broken branch stub
    for f in D["fallen"]:
        dx, dz = math.sin(f["yaw"]) * f["len"] / 2, math.cos(f["yaw"]) * f["len"] / 2
        cylinder(bm, W(f["x"] - dx, 0.17, f["z"] - dz), W(f["x"] + dx, 0.15, f["z"] + dz), 0.18, 10, m=m["FW_Bark"], cap_m=m["FW_WoodCut"], r_end=0.15, wobble=0.07, rng=rng)
        blob(bm, f["x"] - dx * 0.2, 0.33, f["z"] - dz * 0.2, 0.3, 0.05, 0.14, m=m["FW_Moss"], cuts=2, noise=0.12, rng=rng)
        cylinder(bm, W(f["x"] + dx * 0.3, 0.25, f["z"] + dz * 0.3), W(f["x"] + dx * 0.3 + dz * 0.25, 0.45, f["z"] + dz * 0.3 - dx * 0.25), 0.04, 6, m=m["FW_Bark"], r_end=0.025)
    # the stumps
    for x, z in D["stumps"]:
        lathe(bm, x, z, [(0, 0.0), (0.3, 0.0), (0.22, 0.08), (0.2, 0.3), (0, 0.3)], segs=10, m=m["FW_Bark"], jitter=0.08, rng=rng)
        lathe(bm, x, z, [(0, 0.3), (0.19, 0.3), (0, 0.312)], segs=10, m=m["FW_WoodCut"])
    # log steps where the trails climb: every 0.9 m along the trails to the shrine, the Glen and the ledge
    for idx in (1, 3, 5, 7):
        pts = path_polyline(L["paths"][idx], 0.9)
        for (ax, az, aw), (bx, bz, _) in list(zip(pts, pts[1:]))[1:-1]:
            if abs(land_y(bx, bz) - land_y(ax, az)) < 0.05:
                continue
            d = math.hypot(bx - ax, bz - az) or 1.0
            nx, nz = -(bz - az) / d, (bx - ax) / d
            w = aw / 2 + 0.16
            cylinder(bm, W(ax - nx * w, 0.012, az - nz * w), W(ax + nx * w, 0.012, az + nz * w), 0.06, 8, m=m["FW_Bark"], cap_m=m["FW_WoodCut"], wobble=0.05, rng=rng)
    # stones round the pool at the river's head (clear of the fall), in the water: not lifted
    x0, z0, w0 = L["river"]["points"][0]
    cs = L["cascade"]
    back = math.atan2(cs["z"] - z0, cs["x"] - x0)
    for k in range(9):
        a = back + math.pi * (-0.42 + 0.84 * k / 8)
        x, z = x0 + (w0 - 0.1) * math.cos(a), z0 + (w0 - 0.1) * math.sin(a)
        if math.hypot(x - cs["x"], z - cs["z"]) < 1.0 or abs(k - 4) < 1:
            continue
        s = rng.uniform(0.7, 1.15)
        blob(bm, x, water + 0.05, z, 0.24 * s, 0.17 * s, 0.2 * s, m=k % 2, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.3)
    # the far bank (no one walks it): bushes, boulders, ferns and flowers down its length
    F = river_frame(L, 4)
    for k, (x, z, w, tx, tz, nx, nz) in enumerate(F):
        if rim_inside(x, z, half) < 1.2:
            continue
        # (the bank on the island's east side: the normal that points toward +x)
        sx = 1.0 if nx > 0 else -1.0
        ex, ez = x + nx * sx * (w + 0.5), z + nz * sx * (w + 0.5)
        room = (half - 0.7) - ex
        if room < 0.3:
            continue
        px, pz = ex + room * rng.random(), ez + rng.uniform(-0.3, 0.3)
        kind = k % 4
        if kind == 0:
            bush(px, pz, rng.uniform(0.6, 0.9))
        elif kind == 1:
            s = rng.uniform(0.5, 0.85)
            blob(bm, px, 0.12 * s, pz, 0.5 * s, 0.34 * s, 0.42 * s, m=0, cuts=3, noise=0.1, rng=rng, flat_bottom=-0.3)
            blob(bm, px - 0.02, 0.4 * s, pz, 0.3 * s, 0.06, 0.26 * s, m=m["FW_Moss"], cuts=2, noise=0.12, rng=rng)
        elif kind == 2:
            for _ in range(6):
                flower(px + rng.uniform(-0.3, 0.3), pz + rng.uniform(-0.4, 0.4), rng.choice(("FW_PetalYellow", "FW_Petal", "FW_PetalBlue")))
        else:
            bush(px, pz, rng.uniform(0.45, 0.65))
    make_object("Forest_Dressing", bm, M, coll, lift="parts")



# ---------------------------------------------------------------------------------------------
# one draw call a finish: every plain colour baked into the vertices, the still things fused

# the nodes the game moves, shows or instances by name: they stay their own objects
DYNAMIC = ("Animal_", "Fauna_", "Prop_")
# the materials that stay themselves: what glows
KEEP = set(EMISSION)
# (the vista pines' needles and bark keep finishes of their own, FW_VistaNeedle and FW_VistaBark: the
# game sways the one in the wind and thins both between you and the camera)


def slot_of(name):
    """The finish a face painted `name` is drawn with."""
    if name in KEEP:
        return name
    # (finishes of their own, never a palette material's name: the tree looks in trees.glb keep those)
    if name.startswith(("FW_PineNeedle", "FW_CedarNeedle", "FW_BirchLeaf")):
        return "FW_VistaNeedle"
    if name in ("FW_PineBark", "FW_CedarBark", "FW_BirchBark", "FW_BirchMark"):
        return "FW_VistaBark"
    if name in DOUBLE_SIDED:
        return "FW_ClayDouble"
    return "FW_Sheen" if ROUGHNESS.get(name, 0.82) < 0.65 else "FW_Clay"


def bake_colors(ob, one=None):
    """Every face's own colour into the mesh's "Col" corner colours, and its material replaced by
    its finish's (slot_of; or all by the one finish `one`: an animal is a single draw call). The pines keep, in their UVs, each vertex's height over the ground it
    stands on (the game sways them by it)."""
    me = ob.data
    names = [m.name for m in me.materials]
    if not names or names in (["FW_Meadow"], ["FW_Water"]):
        return
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    lifts = me.attributes.get("lift")
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    pines = ob.name.startswith("Forest_Vista")
    uv = me.uv_layers.new(name="UVMap") if pines else None
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
                uv.data[li].uv = (0.0, max(0.0, (world @ me.vertices[vi].co).z - (lifts.data[vi].value if lifts else 0.0)))
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
            mat.use_backface_culling = s != "FW_ClayDouble"
            me.materials.append(mat)
    for poly, i in zip(me.polygons, face_slot):
        poly.material_index = i
    if lifts is not None:
        me.attributes.remove(lifts)
    use_col(me)


def fuse(coll):
    """Bakes every object's colours, then joins the still ones into Forest_Static (and the vista
    pines into Forest_Pines): about one draw call a finish for the whole wood."""
    statics, pines = [], []
    for ob in list(coll.all_objects):
        if ob.type != "MESH" or ob.name in ("Forest_Ground", "Forest_Water"):
            continue
        if ob.name.startswith(("Animal_", "Prop_")):
            bake_colors(ob, one="FW_Clay")
        if ob.name.startswith(DYNAMIC) or ob.parent is not None:
            continue
        bake_colors(ob)
        (pines if ob.name.startswith("Forest_Vista") else statics).append(ob)
    bpy.context.view_layer.update()
    for name, group in (("Forest_Static", statics), ("Forest_Pines", pines)):
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
    return {"objects": len(meshes), "drawCalls": sum(len(o.data.materials) for o in meshes if not o.name.startswith("Fauna_")), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes), "static": [m.name for m in bpy.data.objects["Forest_Static"].data.materials]}


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False, export_extras=False)
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
        if o.data is None:
            continue
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 2), round(hi[0], 2)], "y": [round(lo[2], 2), round(hi[2], 2)], "z": [round(-hi[1], 2), round(-lo[1], 2)], "materials": len(o.data.materials)}
    static = {k: v for k, v in out.items() if not k.startswith(("Tree_", "Animal_", "Fauna_"))}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "staticDrawCalls": sum(v["materials"] for v in static.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll, tcoll, L, trees = build(root)
        fused = fuse(coll)
        out = os.path.join(root, "client", "public", "models", "forest.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        tout = os.path.join(root, "client", "public", "models", "trees.glb")
        export(tcoll, tout)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "treesGlb": tout, "treesBytes": os.path.getsize(tout), "trees": trees, "fused": fused}
        # (the tree looks sit at the origin: not in the studio's grid)
        for o in list(tcoll.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(tcoll)
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
