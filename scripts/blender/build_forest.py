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
DOUBLE_SIDED = {"FW_Fern", "FW_Petal", "FW_PetalYellow", "FW_PetalBlue", "FW_Foam", "FW_Cloth"}

LAYER_MEADOW = 0.004
LAYER_FLOOR = 0.008
LAYER_BANK = 0.012
LAYER_PATH = 0.016
# the meadow's biomes (each zone's `floor`), blended by vertex colour
BIOME = {"meadow": "#6F9A55", "birch": "#8FAE6B", "ridge": "#7F8C68", "glen": "#B48A46", "shrine": "#3F6B4A"}
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
    for name in ("log", "boulder"):
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


def trail(bm, pts, bevel=0.14):
    top, low = LAYER_PATH, 0.002
    n = len(pts)
    rows = []
    for i, (x, z, width) in enumerate(pts):
        (ax, az, _), (bx, bz, _) = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        d = math.hypot(bx - ax, bz - az) or 1
        tx, tz = (bx - ax) / d, (bz - az) / d
        nx, nz = -tz, tx
        w = width / 2 * (1 + 0.04 * math.sin(i * 0.9))
        rows.append([bm.verts.new(W(x + nx * s_ * (w + (bevel if outer else 0)), low if outer else top, z + nz * s_ * (w + (bevel if outer else 0)))) for s_, outer in ((1, True), (1, False), (-1, False), (-1, True))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(3):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    for end, sign in ((0, -1), (n - 1, 1)):
        x, z, width = pts[end]
        (ax, az, _), (bx, bz, _) = (pts[0], pts[1]) if end == 0 else (pts[-2], pts[-1])
        d = math.hypot(bx - ax, bz - az) or 1
        tx, tz = sign * (bx - ax) / d, sign * (bz - az) / d
        nx, nz = -tz, tx
        w = width / 2 * (1 + 0.04 * math.sin(end * 0.9))
        centre = bm.verts.new(W(x, top, z))
        inner, outer = [], []
        for k in range(9):
            a = math.pi * k / 8
            ux, uz = nx * math.cos(a) + tx * math.sin(a), nz * math.cos(a) + tz * math.sin(a)
            inner.append(bm.verts.new(W(x + ux * w, top, z + uz * w)))
            outer.append(bm.verts.new(W(x + ux * (w + bevel), low, z + uz * (w + bevel))))
        for k in range(8):
            bm.faces.new((centre, inner[k], inner[k + 1]))
            bm.faces.new((inner[k], outer[k], outer[k + 1], inner[k + 1]))


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


def make_object(name, bm, mats, coll, origin=None, recalc=True, parent=None):
    """`bm` as a mesh object `name`, its materials `mats`, its origin at the game point `origin`
    (under `parent`, whose origin is at its own game point `parent["origin"]`)."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
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


def build_ground(L, coll):
    half = L["half"]
    depth = L["river"]["depth"]
    bm = bmesh.new()
    slab(bm, rounded_rect(-half, half, -half, half, 1.1, 10), -1.1, 0.0, 0)
    ground = make_object("Forest_Ground", bm, ["FW_Grass", "FW_Soil", "FW_Bed", "FW_StoneDark"], coll)
    bev = ground.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.32
    bev.segments = 4
    bev.limit_method = "ANGLE"
    bake_modifiers(ground)
    # the river's channel: a ribbon along the spline, its banks at the half-width, carried a metre
    # past both ends so it cuts clean out through the island's edges
    F = river_frame(L, 10)
    lefts, rights = [], []
    for k, (x, z, w, tx, tz, nx, nz) in enumerate(F):
        ext = -1.2 if k == 0 else 1.2 if k == len(F) - 1 else 0.0
        cx, cz = x + tx * ext, z + tz * ext
        lefts.append((cx + nx * w, cz + nz * w))
        rights.append((cx - nx * w, cz - nz * w))
    bm = bmesh.new()
    slab(bm, lefts + list(reversed(rights)), -depth, 1.0, 0)
    cutter = make_object("FW_RiverCutter", bm, ["FW_Soil"], coll)
    dig = ground.modifiers.new("River", "BOOLEAN")
    dig.operation = "DIFFERENCE"
    dig.object = cutter
    try:
        dig.solver = "EXACT"
    except Exception:
        pass
    bake_modifiers(ground)
    bpy.data.objects.remove(cutter, do_unlink=True)
    for poly in ground.data.polygons:
        c = poly.center
        gx, gy, gz = c.x, c.z, -c.y
        up = poly.normal.z
        d, w = river_dist(L, gx, gz)
        in_channel = d <= w + 0.06 and gy < -0.02
        if in_channel:
            poly.material_index = 2 if up > 0.6 else 3
        elif up > 0.55 and gy > -0.4:
            poly.material_index = 0
        else:
            poly.material_index = 1
        poly.use_smooth = False
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
    """The river's surface along the spline (its rows clipped to the island, the last ones clamped to
    its edge), spilling over the edge at both ends, and its foam: round the rocks, streaks along the
    banks with the flow, and a lip where it spills."""
    half = L["half"]
    water = L["river"]["water"]
    lim = half - 0.02
    clamp = lambda v: max(-lim, min(lim, v))
    F = river_frame(L, 10)
    inside = [i for i, (x, z, *_) in enumerate(F) if abs(x) <= lim and abs(z) <= lim]
    i0, i1 = max(0, inside[0] - 1), min(len(F) - 1, inside[-1] + 1)
    bm = bmesh.new()
    rows = []
    for x, z, w, tx, tz, nx, nz in F[i0 : i1 + 1]:
        ww = w - 0.015
        rows.append(((clamp(x + nx * ww), clamp(z + nz * ww)), (clamp(x - nx * ww), clamp(z - nz * ww)), (tx, tz)))
    verts = [(bm.verts.new(W(l[0], water, l[1])), bm.verts.new(W(r[0], water, r[1]))) for l, r, _ in rows]
    for (a0, a1), (b0, b1) in zip(verts, verts[1:]):
        f = bm.faces.new((a0, a1, b1, b0))
        f.material_index = 0
        f.smooth = True
    # the spills: over the island's edge at both ends, a sheet of water falling away and a lip of foam
    for (l, r, (tx, tz)), out in ((rows[0], -1.0), (rows[-1], 1.0)):
        ox, oz = tx * out, tz * out
        top = [bm.verts.new(W(l[0], water, l[1])), bm.verts.new(W(r[0], water, r[1]))]
        low = [bm.verts.new(W(l[0] + ox * 0.14, water - 0.62, l[1] + oz * 0.14)), bm.verts.new(W(r[0] + ox * 0.14, water - 0.62, r[1] + oz * 0.14))]
        sheet = bm.faces.new((top[0], top[1], low[1], low[0]))
        sheet.material_index = 0
        sheet.normal_update()
        if sheet.normal.dot(W(ox, 0.0, oz)) < 0:
            sheet.normal_flip()
        mid = [bm.verts.new(W(l[0] + ox * 0.05, water - 0.03, l[1] + oz * 0.05)), bm.verts.new(W(r[0] + ox * 0.05, water - 0.03, r[1] + oz * 0.05))]
        lip = [bm.verts.new(W(l[0] - ox * 0.18, water + 0.01, l[1] - oz * 0.18)), bm.verts.new(W(r[0] - ox * 0.18, water + 0.01, r[1] - oz * 0.18))]
        bm.faces.new((lip[0], lip[1], mid[1], mid[0])).material_index = 1
    rng = random.Random(8)
    for rx, rz, sc in L["river"]["rocks"]:
        for k in range(3):
            a = rng.random() * 6.28
            fx, fz = rx + math.cos(a) * sc * 0.9, rz + math.sin(a) * sc * 0.9
            outline = wobbly_circle(fx, fz, 0.16 + 0.1 * rng.random(), 10, 0.25, rng)
            bm.faces.new([bm.verts.new(W(x, water + 0.012, z)) for x, z in outline]).material_index = 1
    # streaks of foam along the banks, lying with the flow
    Fs = river_frame(L, 12)
    for k in range(34):
        x, z, w, tx, tz, nx, nz = Fs[rng.randrange(2, len(Fs) - 2)]
        side = rng.choice((-1, 1))
        off = w * (0.55 + 0.35 * rng.random()) * side
        fx, fz = x + nx * off, z + nz * off
        if abs(fx) > lim - 0.3 or abs(fz) > lim - 0.3:
            continue
        ln = 0.35 + rng.random() * 0.55
        outline = [(fx + tx * ln / 2 * math.cos(a) + nx * 0.045 * math.sin(a), fz + tz * ln / 2 * math.cos(a) + nz * 0.045 * math.sin(a)) for a in (2 * math.pi * k2 / 10 for k2 in range(10))]
        bm.faces.new([bm.verts.new(W(x2, water + 0.008, z2)) for x2, z2 in outline]).material_index = 1
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0 and f.material_index == 1:
            f.normal_flip()
    for f in bm.faces:
        if f.material_index == 0 and abs(f.normal.z) > 0.5 and f.normal.z < 0:
            f.normal_flip()
    make_object("Forest_Water", bm, ["FW_Water", "FW_Foam"], coll, recalc=False)


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


def biome_color(L, x, z):
    """The meadow's colour at (x, z): each zone's grass blended in along wandering edges (the point
    warped by a few slow sines before it is measured against the zone), a little mottling, and the
    base grass again at the banks and the rim."""
    wx = x + 0.9 * math.sin(z * 0.45 + 1.3) + 0.45 * math.sin(z * 1.15 + 0.4)
    wz = z + 0.9 * math.sin(x * 0.4 + 2.1) + 0.45 * math.sin(x * 1.25 + 1.1)
    base = lin(BIOME["meadow"])
    acc = [0.0, 0.0, 0.0]
    tot = 0.0
    for zn in L["zones"]:
        f = zn["floor"]
        if f not in BIOME or f == "meadow":
            continue
        dx = max(zn["x0"] - wx, 0.0, wx - zn["x1"])
        dz = max(zn["z0"] - wz, 0.0, wz - zn["z1"])
        outside = math.hypot(dx, dz)
        depth = min(wx - zn["x0"], zn["x1"] - wx, wz - zn["z0"], zn["z1"] - wz)
        d = outside if outside > 0 else -depth
        w = smooth(1.6, -1.4, d)
        if w <= 0:
            continue
        c = lin(BIOME[f])
        tot += w
        for k in range(3):
            acc[k] += c[k] * w
    if tot > 1:
        acc = [a / tot for a in acc]
        tot = 1.0
    col = [base[k] * (1 - tot) + acc[k] for k in range(3)]
    mottle = 1 + 0.06 * math.sin(x * 1.7 + z * 0.6) * math.sin(z * 1.3 - x * 0.4) + 0.04 * math.sin(x * 3.1 + 0.7) * math.sin(z * 2.7)
    col = [c * mottle for c in col]
    grass = lin(PALETTE["FW_Grass"])
    d, w = river_dist(L, x, z)
    ease = max(smooth(0.9, 0.0, d - w), smooth(0.7, 0.0, rim_dist(x, z, L["half"] - 0.36, 0.78)))
    return [c * (1 - ease) + grass[i] * ease for i, c in enumerate(col)]


def build_meadow(L, coll):
    """The island's top as a fine grid of grass, coloured vertex by vertex (biome_color), over the
    ground's own top; the grid leaves the river's channel open."""
    a = L["half"] - 0.36
    step = 0.24
    n = int(round(2 * a / step)) + 1
    xs = [-a + i * (2 * a) / (n - 1) for i in range(n)]
    bm = bmesh.new()
    V = [[bm.verts.new(W(x, LAYER_MEADOW, z)) for z in xs] for x in xs]
    wet = [[river_dist(L, x, z) for z in xs] for x in xs]
    for i in range(n - 1):
        for j in range(n - 1):
            corners = ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))
            if not all(in_rounded(xs[p], xs[q], a, 0.78) for p, q in corners):
                continue
            if any(wet[p][q][0] < wet[p][q][1] + 0.03 for p, q in corners):
                continue
            bm.faces.new([V[p][q] for p, q in corners])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    col = bm.loops.layers.float_color.new("Col")
    cache = {}
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        for loop in f.loops:
            v = loop.vert
            key = (round(v.co.x, 4), round(v.co.y, 4))
            if key not in cache:
                cache[key] = (*biome_color(L, v.co.x, -v.co.y), 1.0)
            loop[col] = cache[key]
    me = bpy.data.meshes.new("Forest_MeadowMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("FW_Meadow"))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
    ob = bpy.data.objects.new("Forest_Meadow", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]
    return ob


def build_banks(L, coll):
    """Damp dark earth along both banks, from the channel's lip out a little over the meadow (on the
    island's flat top only)."""
    a = L["half"] - 0.36
    F = river_frame(L, 12)
    bm = bmesh.new()
    for side in (1, -1):
        prev = None
        for x, z, w, tx, tz, nx, nz in F:
            wob = 0.06 * math.sin(x * 2.3 + z * 1.7 + side)
            inner = (x + nx * side * (w - 0.03), z + nz * side * (w - 0.03))
            outer = (x + nx * side * (w + 0.4 + wob), z + nz * side * (w + 0.4 + wob))
            if in_rounded(*inner, a, 0.78) and in_rounded(*outer, a, 0.78):
                vi = bm.verts.new(W(inner[0], LAYER_BANK, inner[1]))
                vo = bm.verts.new(W(outer[0], LAYER_BANK, outer[1]))
                if prev:
                    bm.faces.new((prev[0], prev[1], vo, vi))
                prev = (vi, vo)
            else:
                prev = None
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    make_object("Forest_Banks", bm, ["FW_Bank"], coll, recalc=False)


def build_floors(L, coll):
    """The shrine's flagstone floor round the elderwood (the zones' grass is the meadow's colour)."""
    rng = random.Random(5)
    bm = bmesh.new()
    sh = L["shrine"]
    for k in range(18):
        a = 2 * math.pi * k / 18 + 0.1
        for ring, rr in enumerate((0.7, 1.25)):
            if ring == 0 and k % 2:
                continue
            cx, cz = sh["x"] + math.cos(a) * rr, sh["z"] + math.sin(a) * rr
            slab(bm, wobbly_circle(cx, cz, 0.24, 8, 0.15, rng), -0.02, LAYER_FLOOR + 0.006, 0)
    make_object("Forest_Floors", bm, ["FW_StoneDark"], coll)


def build_paths(L, coll):
    bm = bmesh.new()
    for path in L["paths"]:
        trail(bm, path_polyline(path))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    make_object("Forest_Paths", bm, ["FW_Dirt"], coll, recalc=False)


def zone_of(L, x, z):
    for zn in L["zones"]:
        if zn["x0"] <= x <= zn["x1"] and zn["z0"] <= z <= zn["z1"]:
            return zn["id"]
    return ""


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
    return True


def build_deco(L, coll):
    rng = random.Random(31)
    bm = bmesh.new()
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
    while placed < 120 and tries < 3000:
        tries += 1
        x, z = rng.uniform(-11, 9), rng.uniform(-11, 11)
        if not clear_spot(L, x, z, 0.12):
            continue
        zn = zone_of(L, x, z)
        roll = rng.random()
        if zn == "glen" and roll < 0.55:
            # a pile of fallen leaves: a few flat lumps in orange and gold
            for k in range(3):
                blob(bm, x + rng.uniform(-0.15, 0.15), 0.03, z + rng.uniform(-0.15, 0.15), 0.16, 0.035, 0.13, m=7 if k % 2 else 8, cuts=2, noise=0.2, rng=rng)
        elif zn in ("birch", "shrine") and roll < 0.45:
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
            if (x - t["x"]) * -t["x"] + (z - t["z"]) * -t["z"] > 0.4 * math.hypot(t["x"], t["z"]):
                continue
            if clear_spot(L, x, z, 0.2):
                fern(x, z, 0.8 + 0.4 * rng.random())
    # red mushroom patches among the fellable trees' roots (on the far side, like the ferns)
    for t in L["trees"]:
        a = rng.random() * 6.28
        for k in range(3):
            rr = 0.75 + 0.3 * rng.random()
            x, z = t["x"] + rr * math.cos(a + k * 2.1), t["z"] + rr * math.sin(a + k * 2.1)
            if (x - t["x"]) * -t["x"] + (z - t["z"]) * -t["z"] > 0.4 * math.hypot(t["x"], t["z"]) or not clear_spot(L, x, z, 0.15):
                continue
            mushrooms(x, z, 3 + (k % 2))
            break
    # low wild berry bushes along the trail's margins and the groves' edges
    bushes = 0
    tries = 0
    while bushes < 10 and tries < 800:
        tries += 1
        x, z = rng.uniform(-10.5, 8.5), rng.uniform(-10.5, 10.5)
        if zone_of(L, x, z) not in ("border", "birch", "cedar") or not clear_spot(L, x, z, 0.45):
            continue
        for k in range(2):
            bx, bz = x + 0.22 * (k - 0.5), z + 0.1 * (k - 0.5)
            blob(bm, bx, 0.15, bz, 0.26, 0.2, 0.24, m=1, cuts=3, noise=0.08, rng=rng, flat_bottom=-0.05)
            for q in range(6):
                a = rng.random() * 6.28
                blob(bm, bx + math.cos(a) * 0.22, 0.16 + rng.uniform(-0.04, 0.1), bz + math.sin(a) * 0.2, 0.028, 0.028, 0.028, m=5, cuts=1)
        bushes += 1
    make_object("Forest_Deco", bm, ["FW_Tuft", "FW_Fern", "FW_Petal", "FW_PetalYellow", "FW_PetalBlue", "FW_MushCap", "FW_MushStem", "FW_LeafPile", "FW_MapleLeafGold"], coll)


def shrine_stones(L):
    sh = L["shrine"]
    gap = 0.26 * math.pi
    open_ = math.atan2(-sh["z"], -sh["x"])
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
    while placed < 7 and tries < 400:
        tries += 1
        x, zz = rng.uniform(-1.8, 8.5), rng.uniform(-5.2, 5.8)
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
    make_object("Forest_Rocks", bm, ["FW_Stone", "FW_StoneDark", "FW_Moss", "FW_Rune", "FW_Pebble"], coll)


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
    make_object("Forest_Vista", bm, ["FW_PineBark", "FW_PineNeedle", "FW_PineNeedleLight"], coll)


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
    make_object("Forest_Structures", bm, ["FW_Bark", "FW_Log", "FW_WoodCut", "FW_Plank", "FW_PlankDark", "FW_Roof", "FW_Window", "FW_Iron", "FW_Stone", "FW_Rope", "FW_Honey", "FW_Cloth", "FW_Red", "FW_PineNeedle", "FW_Moss"], coll)


def build_adit(L, bm, rng):
    """The old mine adit down to the Glimmering Caverns, behind the Autumn Maples on the western cliff:
    a mossy outcrop, a timber-framed portal onto the dark (facing into the wood, +x), vines hanging
    over its lintel, bushes crowding its sides, a lantern on its post, the old rails running out under
    the grass. (Materials as build_structures': 0 bark, 1 log, 3 plank, 4 plank dark, 6 window, 7
    iron, 8 stone, 13 pine needle, 14 moss.)"""
    A = L["adit"]
    O = A["outcrop"]
    x, z, hw, h = A["x"], A["z"], A["w"] / 2, A["h"]
    face = O["x1"]
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
    # the old rails out of the dark, sinking under the grass
    for k in range(6):
        rx = face - 0.5 + k * 0.42
        box(bm, rx, rx + 0.12, 0.0, 0.035, z - 0.42, z + 0.42, m=4)
    for sz in (-0.28, 0.28):
        box(bm, face - 0.7, face + 1.6, 0.03, 0.06, z + sz - 0.025, z + sz + 0.025, m=7)


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
    deer.location = W(ax, 0.0, az)
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
        ob.location = W(r["x"] + dx, 0.0, r["z"] + dz)
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
    RIVER_FRAMES.clear()
    L = read_layout(root)
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    build_ground(L, coll)
    build_meadow(L, coll)
    build_banks(L, coll)
    build_water(L, coll)
    build_floors(L, coll)
    build_paths(L, coll)
    build_deco(L, coll)
    build_rocks(L, coll)
    build_vista(L, coll)
    build_structures(L, cushions, coll)
    build_animals(L, coll)
    build_fauna(coll)
    tcoll = bpy.data.collections.new(TREES_COLLECTION)
    bpy.context.scene.collection.children.link(tcoll)
    trees = build_trees(tcoll)
    return coll, tcoll, L, trees


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
        out = os.path.join(root, "client", "public", "models", "forest.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        tout = os.path.join(root, "client", "public", "models", "trees.glb")
        export(tcoll, tout)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "treesGlb": tout, "treesBytes": os.path.getsize(tout), "trees": trees, **summary(coll)}
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
