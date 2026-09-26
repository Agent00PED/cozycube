"""The Velvet Casino: builds client/public/models/casino.glb.

Run it inside Blender, through the Live Bridge (it runs the "code" field of a POSTed JSON body,
queued: nothing comes back, so the summary is written to REPORT_PATH):

    python -c "import json,sys; print(json.dumps({'code': 'REPO_ROOT=r\\'<repo>\\'\\nREPORT_PATH=r\\'<file>\\'\\n' + open('scripts/blender/build_casino.py').read()}))" \\
      | curl -X POST http://127.0.0.1:8192 -H "Content-Type: application/json" --data-binary @-

or headless:

    blender -b -P scripts/blender/build_casino.py

Nothing is placed by hand: where everything stands comes from CASINO_LAYOUT in
shared/worlds/casino.ts (the JSON between its layout markers, read as is), and every seat's
height from its cushion in shared/seats.ts (barStool, pokerChair, clubChair, ottoman,
pianoBench): the same numbers the walkable floor, the colliders and the seat anchors are derived
from. A mid-century Art-Deco hall in matte clay: every material opaque (roughness 0.7-0.9, the
brass and the lacquer a touch smoother), the lamps, the crystal and the neon emissive.

    Casino_Static        everything that stands still, merged into ONE object with one material
                         slot per finish, so the whole hall costs a draw call per material:
                           the slab and its five floors (burgundy velvet carpet with a gold
                           Art-Deco inlay and a sunburst round the roulette table, a black and
                           white marble checker in the foyer with a velvet runner from the doors,
                           dark terrazzo edged with a cyan neon strip in Neon Alley, emerald
                           carpet in the High-Roller Pit, a mahogany plank floor in the lounge);
                           the two back walls (oxblood, mahogany wainscot, gold rail and crown,
                           fluted pilasters, fan sconces); the grand double doors with a glowing
                           fan transom; the Golden Cage (a mahogany counter, a marble top, brass
                           bars, an arched teller window under a stepped crest, a vault door,
                           a banker's lamp, a bell); two potted palms, the round tufted ottoman
                           with its bouquet, the fern planters out front; the roulette table (the wheel is its
                           own node); two half-moon blackjack tables and their stools; the slot
                           row with its neon chevron header; the poker table, its chairs and the
                           velvet ropes; the bar, the back bar's bottles and mirror, the bar
                           stools, the cocktail tables and club chairs, the baby grand and its
                           bench; the brass rail along the front edges; four crystal chandeliers
    Prop_RouletteWheel   the wheel (bowl, pockets, turret), its origin at its centre on the felt:
                         the game spins it

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts, so every number below
reads as in casino.ts. Floors are layered a few millimetres apart (carpet 0, zone floors 0.006,
inlays over them): nothing on the floor is coplanar with anything else.
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
    "CS_Bulb": "#FFD98A",
    "CS_Crystal": "#FFF1D0",
    "CS_SlotScreen": "#FFF3CC",
    "CS_NeonPink": "#FF4FA3",
    "CS_NeonCyan": "#4FE3FF",
}
ROUGHNESS = {"CS_Gold": 0.6, "CS_Brass": 0.6, "CS_Inlay": 0.65, "CS_Black": 0.55, "CS_Chrome": 0.55, "CS_Mirror": 0.5, "CS_MarbleLight": 0.7, "CS_MarbleDark": 0.7, "CS_Velvet": 0.9, "CS_Carpet": 0.92, "CS_Runner": 0.92, "CS_PitCarpet": 0.92, "CS_Felt": 0.9}
# glowing things: (strength) of an emission in their own colour
EMISSION = {"CS_Bulb": 2.6, "CS_Crystal": 2.2, "CS_SlotScreen": 1.6, "CS_NeonPink": 3.0, "CS_NeonCyan": 3.0}


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
    for name in ("barStool", "pokerChair", "clubChair", "ottoman", "pianoBench"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


# ---------------------------------------------------------------------------------------------
# the one static mesh: every part adds its faces to it, in the slot of its material


class Mesh:
    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def m(self, name):
        """The slot of material `name` in this mesh (added on first use)."""
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


def box(M, x0, x1, y0, y1, z0, z1, mat):
    slab(M, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, mat)


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


def blob(M, cx, cy, cz, hx, hy, hz, mat, cuts=3, n=2.2, yaw=0.0, droop=0.0):
    """A rounded lump (a superellipsoid) centred at the game point (cx, cy, cz), its x half-size
    along heading `yaw`; `droop` bends its ends down (a palm frond)."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    c, s = math.cos(yaw), math.sin(yaw)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        lx, ly, lz = q.x * hx, q.z * hy, -q.y * hz
        ly -= droop * (q.x * q.x)
        v.co = W(cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c)
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = M.m(mat)
        f.smooth = True
    for v in bm.verts:
        v.tag = False


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
    m.use_backface_culling = True
    return m


def make_object(name, M, coll, origin=None):
    """The mesh `M` as an object `name`, its origin at the game point `origin`. Its faces are
    turned to face outward first (the three.js runtime culls back faces)."""
    bm = M.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name + "Mesh")
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
    bm.to_mesh(me)
    bm.free()
    for m in M.mats:
        me.materials.append(material(m))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if origin is not None:
        ob.location = W(*origin)
    return ob


# ---------------------------------------------------------------------------------------------
# the floor: the slab, the carpet, the five zones' floors and the gold inlays


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
            box(M, f["x0"] + i * tw, f["x0"] + (i + 1) * tw, 0.0, FLOOR_ZONE, f["z0"] + j * td, f["z0"] + (j + 1) * td, "CS_MarbleLight" if (i + j) % 2 == 0 else "CS_MarbleDark")
    d = L["doors"]
    runner_end = L["ottoman"]["z"] - L["ottoman"]["r"] - 0.35
    box(M, d["x"] - 0.6, d["x"] + 0.6, FLOOR_ZONE, FLOOR_ZONE + 0.004, -h + 0.2, runner_end, "CS_Runner")
    for sx in (-1, 1):
        x = d["x"] + sx * 0.6
        box(M, min(x, x - sx * 0.07), max(x, x - sx * 0.07), FLOOR_ZONE + 0.004, FLOOR_ZONE + 0.006, -h + 0.2, runner_end, "CS_Inlay")
    frame_strips(M, f["x0"], f["x1"], f["z0"], f["z1"], 0.08, FLOOR_ZONE, INLAY_ON_ZONE, "CS_Inlay")

    # 3 Neon Alley: dark terrazzo, a cyan neon strip along its open edge
    a = zone(L, "alley")
    box(M, a["x0"], a["x1"], 0.0, FLOOR_ZONE, a["z0"], a["z1"], "CS_Terrazzo")
    box(M, a["x1"] - 0.07, a["x1"] - 0.01, FLOOR_ZONE, INLAY_ON_ZONE + 0.002, a["z0"] + 0.05, a["z1"] - 0.05, "CS_NeonCyan")

    # 4 the pit: emerald carpet, a gold border along its roped edges
    p = zone(L, "pit")
    box(M, p["x0"], p["x1"], 0.0, FLOOR_ZONE, p["z0"], p["z1"], "CS_PitCarpet")
    box(M, p["x1"] - 0.16, p["x1"] - 0.08, FLOOR_ZONE, INLAY_ON_ZONE, p["z0"] + 0.2, p["z1"] - 0.08, "CS_Inlay")
    box(M, p["x0"] + 0.2, p["x1"] - 0.08, FLOOR_ZONE, INLAY_ON_ZONE, p["z1"] - 0.16, p["z1"] - 0.08, "CS_Inlay")

    # 5 the lounge: mahogany planks, two tones, with a gold edge where it meets the carpet
    lz = zone(L, "lounge")
    n = int(round((lz["z1"] - lz["z0"]) / 0.35))
    step = (lz["z1"] - lz["z0"]) / n
    for k in range(n):
        box(M, lz["x0"], lz["x1"], 0.0, FLOOR_ZONE, lz["z0"] + k * step, lz["z0"] + (k + 1) * step, "CS_Plank" if k % 2 == 0 else "CS_PlankDark")
    box(M, lz["x1"] - 0.08, lz["x1"], FLOOR_ZONE, INLAY_ON_ZONE, lz["z0"], lz["z1"], "CS_Inlay")
    box(M, lz["x0"] + 0.2, lz["x1"] - 0.08, FLOOR_ZONE, INLAY_ON_ZONE, lz["z0"], lz["z0"] + 0.08, "CS_Inlay")

    # 2 the main floor's Art-Deco inlay: a double gold frame round the gaming floor, stepped
    # corners, lozenges on its sides; a gold octagon and a sunburst round the roulette table
    x0, x1, z0, z1 = -2.6, 10.6, -3.6, 8.4
    frame_strips(M, x0, x1, z0, z1, 0.1, 0.0, INLAY, "CS_Inlay")
    frame_strips(M, x0 + 0.26, x1 - 0.26, z0 + 0.26, z1 - 0.26, 0.04, 0.0, INLAY, "CS_Inlay")
    for cx, cz, sx, sz in ((x0, z0, 1, 1), (x1, z0, -1, 1), (x0, z1, 1, -1), (x1, z1, -1, -1)):
        for k in range(3):
            ax, az = cx + sx * (0.42 + k * 0.22), cz + sz * (0.42 + k * 0.22)
            box(M, min(ax, ax + sx * 0.16), max(ax, ax + sx * 0.16), 0.0, INLAY, min(az, az + sz * 0.16), max(az, az + sz * 0.16), "CS_Inlay")
    for mx, mz in (((x0 + x1) / 2, z0 + 0.13), ((x0 + x1) / 2, z1 - 0.13), (x0 + 0.13, (z0 + z1) / 2), (x1 - 0.13, (z0 + z1) / 2)):
        slab(M, [(mx - 0.26, mz), (mx, mz - 0.26), (mx + 0.26, mz), (mx, mz + 0.26)], 0.0, INLAY + 0.001, "CS_Inlay")
    rx, rz = L["roulette"]["x"], L["roulette"]["z"]
    outer = circle(rx, rz, 2.4, 8)
    inner = circle(rx, rz, 2.33, 8)
    band(M, outer, inner, 0.0, INLAY, "CS_Inlay")
    for k in range(16):
        a0 = 2 * math.pi * (k + 0.35) / 16
        a1 = 2 * math.pi * (k + 0.65) / 16
        am = (a0 + a1) / 2
        slab(M, [(rx + 2.48 * math.cos(a0), rz + 2.48 * math.sin(a0)), (rx + 3.0 * math.cos(am), rz + 3.0 * math.sin(am)), (rx + 2.48 * math.cos(a1), rz + 2.48 * math.sin(a1))], 0.0, INLAY, "CS_Inlay")


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
    # the transom: a fan of glowing glass wedges between gold ribs, a gold arch round it
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


# ---------------------------------------------------------------------------------------------
# 1 the foyer: the Golden Cage, the palms, the ottoman


def build_cage(M, L):
    c = L["cage"]
    x0, x1, z0, z1 = c["x0"], c["x1"], c["z0"], c["z1"]
    counter = c["counter"]
    win = c["window"]
    ch = c["h"]
    h = L["half"]
    face_z = -h + L["walls"]["t"]
    front = z1 - 0.3  # the counter's back face (the bars stand on it)

    # the counter: mahogany, gold fluting, a marble top overhanging the front
    box(M, x0, x1, 0.0, counter - 0.05, front, z1, "CS_Mahogany")
    box(M, x0, x1, 0.0, 0.08, z1 - 0.02, z1 + 0.01, "CS_Gold")
    xk = x0 + 0.3
    while xk < x1 - 0.2:
        box(M, xk - 0.02, xk + 0.02, 0.14, counter - 0.14, z1, z1 + 0.012, "CS_Gold")
        xk += 0.4
    box(M, x0 - 0.02, x1, counter - 0.05, counter, front - 0.15, z1 + 0.08, "CS_MarbleLight")
    # the side: a mahogany panel, bars above it
    box(M, x0, x0 + 0.2, 0.0, counter, face_z, front, "CS_Mahogany")
    box(M, x0 - 0.01, x0 + 0.21, counter, counter + 0.04, face_z, front, "CS_Gold")
    # the brass bars, the teller window left open in them
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
    # the frieze over the bars and its stepped Art-Deco crest over the window
    box(M, x0, x1, top_y, ch, front, z1, "CS_Mahogany")
    box(M, x0, x0 + 0.2, top_y, ch, face_z, front, "CS_Mahogany")
    box(M, x0, x1, top_y + 0.07, top_y + 0.12, z1, z1 + 0.012, "CS_Gold")
    for k, w in enumerate((1.3, 0.9, 0.5)):
        box(M, win - w / 2, win + w / 2, ch + k * 0.12, ch + (k + 1) * 0.12, front + 0.05 + k * 0.03, z1 - k * 0.03, "CS_Gold" if k != 1 else "CS_Mahogany")
    # the teller window: gold posts and an arch
    for sx in (-1, 1):
        box(M, win + sx * 0.55 - 0.035, win + sx * 0.55 + 0.035, counter, counter + 0.8, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    arc_c = counter + 0.8
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12
        pts = [(win + 0.51 * math.cos(a0), arc_c + 0.51 * math.sin(a0)), (win + 0.59 * math.cos(a0), arc_c + 0.59 * math.sin(a0)), (win + 0.59 * math.cos(a1), arc_c + 0.59 * math.sin(a1)), (win + 0.51 * math.cos(a1), arc_c + 0.51 * math.sin(a1))]
        vslab(M, pts, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    # the teller's platform behind the counter: Mr. Vance stands on it, paws on the counter
    fl = c["floor"]
    box(M, x0 + 0.2, x1 - 0.2, 0.0, fl - 0.02, face_z, front, "CS_MahoganyDark")
    box(M, x0 + 0.2, x1 - 0.2, fl - 0.02, fl, face_z, front, "CS_Runner")  # its top is `floor`: his feet
    # the vault door on the wall behind, beside him: a brass disc, a dark ring, a three-spoke wheel
    vx, vy = win + 1.45, fl + 1.0
    cylinder(M, (vx, vy, face_z), (vx, vy, face_z + 0.08), 0.62, "CS_Brass", sides=24)
    cylinder(M, (vx, vy, face_z + 0.08), (vx, vy, face_z + 0.1), 0.5, "CS_Black", sides=24)
    cylinder(M, (vx, vy, face_z + 0.1), (vx, vy, face_z + 0.2), 0.08, "CS_Gold", sides=12)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        cylinder(M, (vx, vy, face_z + 0.18), (vx + 0.34 * math.cos(a), vy + 0.34 * math.sin(a), face_z + 0.18), 0.025, "CS_Gold", sides=8)
    # on the counter: a banker's lamp, a bell, a stack of chips
    lx, lz = win - 0.85, z1 - 0.12
    lathe(M, lx, lz, [(0, 0), (0.09, 0), (0.09, 0.02), (0.02, 0.03), (0, 0.03)], "CS_Brass", segs=12, y0=counter)
    cylinder(M, (lx, counter + 0.03, lz), (lx, counter + 0.28, lz), 0.012, "CS_Brass", sides=6)
    obox(M, lx, lz, 0.0, -0.08, 0.08, -0.16, 0.16, counter + 0.28, counter + 0.34, "CS_Felt")
    obox(M, lx, lz, 0.0, -0.06, 0.06, -0.13, 0.13, counter + 0.26, counter + 0.28, "CS_Bulb")
    lathe(M, win + 0.8, z1 - 0.12, [(0, 0), (0.07, 0), (0.065, 0.03), (0.04, 0.07), (0.01, 0.09), (0, 0.1)], "CS_Gold", segs=12, y0=counter)
    for k, mat in enumerate(("CS_Red", "CS_Black", "CS_Ivory", "CS_Red")):
        lathe(M, win + 0.35, z1 - 0.1, [(0, 0), (0.05, 0), (0.05, 0.018), (0, 0.018)], mat, segs=12, y0=counter + k * 0.02)
    # the open end at the slab's edge: a low panel, so the counter reads as closed
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
    # the round tufted ottoman: velvet, a gold plinth, gold buttons, a column with a bouquet
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


# ---------------------------------------------------------------------------------------------
# 2 the main floor: the roulette table (and its wheel), the blackjack tables and their stools

RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
WHEEL_R = 0.44


def wheel_centre(L):
    r = L["roulette"]
    return (r["x"] + r["wheel"], r["top"] + 0.005, r["z"])


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
    # the betting layout: 36 numbers in three rows of twelve, the zero, gold rules round it
    gx0, gx1, gz0, gz1 = x0 + 1.05, x1 - 0.22, z0 + 0.22, z1 - 0.22
    cw, rh = (gx1 - gx0) / 12, (gz1 - gz0) / 3
    for col in range(12):
        for row in range(3):
            n = col * 3 + (3 - row)
            box(M, gx0 + col * cw + 0.012, gx0 + (col + 1) * cw - 0.012, top, top + 0.003, gz0 + row * rh + 0.012, gz0 + (row + 1) * rh - 0.012, "CS_Red" if n in RED_NUMBERS else "CS_Black")
    box(M, gx0 - 0.16, gx0 - 0.02, top, top + 0.003, gz0 + 0.012, gz1 - 0.012, "CS_Felt")
    frame_strips(M, gx0 - 0.19, gx1 + 0.02, gz0 - 0.02, gz1 + 0.02, 0.018, top, top + 0.004, "CS_Gold")
    # a few stacks of chips on the felt
    for k, (dx, dz, mat, n) in enumerate(((0.3, 0.25, "CS_Red", 4), (0.62, 0.18, "CS_Black", 3), (0.95, -0.3, "CS_Ivory", 5), (1.3, 0.3, "CS_Red", 2))):
        for j in range(n):
            lathe(M, r["x"] + dx - 0.6, r["z"] + dz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], mat if j % 2 == 0 else "CS_Ivory", segs=10, y0=top + j * 0.015)
    # the wheel's well in the rim
    wx, _, wz = wheel_centre(L)
    lathe(M, wx, wz, [(0, top - 0.004), (WHEEL_R + 0.05, top - 0.004), (WHEEL_R + 0.05, top + 0.01), (0, top + 0.01)], "CS_Gold", segs=32)


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
    b = L["blackjack"]
    r = b["r"]
    top = b["top"]
    seat = cushions["barStool"]["top"]
    arc = lambda cx, cz, rad, n=24: [(cx + rad * math.sin(math.radians(-90 + 180 * k / n)), cz + rad * math.cos(math.radians(-90 + 180 * k / n))) for k in range(n + 1)]
    for t in b["tables"]:
        cx, cz = t["x"], t["z"]
        for sx in (-1, 1):
            lathe(M, cx + sx * 0.45, cz + 0.35, [(0, 0), (0.24, 0), (0.24, 0.04), (0.08, 0.1), (0.07, top - 0.16), (0.2, top - 0.1), (0, top - 0.1)], "CS_Mahogany", segs=14)
        slab(M, arc(cx, cz, r), top - 0.1, top - 0.02, "CS_Mahogany")
        slab(M, arc(cx, cz, r - 0.12), top - 0.02, top, "CS_Felt")
        # the padded velvet rail round the curve, the dealer's mahogany ledge on the flat side
        band(M, arc(cx, cz, r + 0.02), arc(cx, cz, r - 0.12), top - 0.02, top + 0.05, "CS_Velvet", closed=False)
        box(M, cx - r, cx + r, top - 0.02, top + 0.03, cz - 0.02, cz + 0.08, "CS_Mahogany")
        # the felt's gold arcs, the chip tray and the card shoe
        band(M, arc(cx, cz, 0.64), arc(cx, cz, 0.62), top, top + 0.003, "CS_Gold", closed=False)
        band(M, arc(cx, cz, 0.44), arc(cx, cz, 0.43), top, top + 0.003, "CS_Gold", closed=False)
        box(M, cx - 0.34, cx + 0.34, top, top + 0.03, cz + 0.1, cz + 0.24, "CS_Black")
        for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red", "CS_Ivory")):
            box(M, cx - 0.3 + k * 0.1, cx - 0.22 + k * 0.1, top + 0.03, top + 0.045, cz + 0.12, cz + 0.22, mat)
        box(M, cx + 0.5, cx + 0.72, top, top + 0.09, cz + 0.1, cz + 0.26, "CS_MahoganyDark")
        # two cards dealt at a couple of places
        for deg in (-35, 25):
            px, pz = cx + 0.8 * math.sin(math.radians(deg)), cz + 0.8 * math.cos(math.radians(deg))
            obox(M, px, pz, math.radians(deg), -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Ivory")
        for deg in b["stoolAngles"]:
            stool(M, cx + b["stoolR"] * math.sin(math.radians(deg)), cz + b["stoolR"] * math.cos(math.radians(deg)), seat)


# ---------------------------------------------------------------------------------------------
# 3 Neon Alley: the slot machines and the neon chevrons over them


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
    # the reel window: three glowing reels behind a chrome frame, black dividers
    box(M, X1 - 0.17, X1 - 0.14, 1.02, 1.36, z - 0.3, z + 0.3, "CS_SlotScreen")
    for dz in (-0.1, 0.1):
        box(M, X1 - 0.14, X1 - 0.13, 1.02, 1.36, z + dz - 0.012, z + dz + 0.012, "CS_Black")
    frame = [(1.0, 1.02, -0.32, 0.32), (1.36, 1.38, -0.32, 0.32), (1.02, 1.36, -0.32, -0.3), (1.02, 1.36, 0.3, 0.32)]
    for y0, y1, a, b in frame:
        box(M, X1 - 0.15, X1 - 0.12, y0, y1, z + a, z + b, "CS_Chrome")
    # the button deck, three buttons
    box(M, X1 - 0.15, X1 + 0.06, 0.86, 0.93, z - 0.36, z + 0.36, "CS_Black")
    for j, mat in enumerate(("CS_Red", "CS_Gold", "CS_Red")):
        box(M, X1 - 0.08, X1 + 0.0, 0.93, 0.95, z - 0.2 + j * 0.2 - 0.04, z - 0.2 + j * 0.2 + 0.04, mat)
    # the marquee: two neon tubes on its face, a chrome cap
    box(M, X0, X1 - 0.1, H - 0.2, H - 0.03, z - hw, z + hw, body)
    for y in (H - 0.16, H - 0.09):
        box(M, X1 - 0.1, X1 - 0.08, y - 0.015, y + 0.015, z - hw + 0.06, z + hw - 0.06, neon)
    box(M, X0, X1 - 0.08, H - 0.03, H, z - hw - 0.01, z + hw + 0.01, "CS_Chrome")
    # the lever on the machine's side, a red ball on it
    cylinder(M, (X1 - 0.3, 0.95, z + hw + 0.02), (X1 - 0.28, 1.4, z + hw + 0.07), 0.018, "CS_Chrome", sides=8)
    blob(M, X1 - 0.28, 1.44, z + hw + 0.07, 0.05, 0.05, 0.05, "CS_Red", cuts=2)


def build_alley(M, L):
    s = L["slots"]
    for k, z in enumerate(s["zs"]):
        slot_machine(M, L, z, k)
    slot_machine(M, L, s["jasper"], 0, jasper=True)
    # the neon header along the wall over the row: a pink chevron between two cyan tubes
    face_x = -L["half"] + L["walls"]["t"]
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


# ---------------------------------------------------------------------------------------------
# 4 the High-Roller Pit: the poker table, its chairs, the velvet ropes


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
    band(M, inner, rounded_rect(x - p["len"] / 2 + 0.16, x + p["len"] / 2 - 0.16, z - p["w"] / 2 + 0.16, z + p["w"] / 2 - 0.16, p["w"] / 2 - 0.16, per_corner=10), top, top + 0.003, "CS_Gold")
    seat = cushions["pokerChair"]["top"]
    for c in p["chairs"]:
        chair(M, c["x"], c["z"], c["yaw"], seat)
        # a stack of chips on the felt in front of each place, and two cards
        px, pz = x + (c["x"] - x) * 0.45, z + (c["z"] - z) * 0.45
        for j in range(3):
            lathe(M, px, pz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], ("CS_Red", "CS_Black", "CS_Ivory")[j], segs=10, y0=top + j * 0.015)
        obox(M, px + 0.12, pz, 0.3, -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Ivory")
    # Boris's side of the table: a dealer's chip rack
    box(M, x - 0.3, x + 0.3, top, top + 0.04, z - p["w"] / 2 + 0.18, z - p["w"] / 2 + 0.32, "CS_Black")
    for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red")):
        box(M, x - 0.26 + k * 0.105, x - 0.18 + k * 0.105, top + 0.04, top + 0.055, z - p["w"] / 2 + 0.2, z - p["w"] / 2 + 0.3, mat)
    # the velvet ropes on brass stanchions
    for rope in L["ropes"]:
        (ax, az), (bx, bz) = rope["a"], rope["b"]
        n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
        posts = [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n + 1)]
        for px, pz in posts:
            lathe(M, px, pz, [(0, 0), (0.14, 0), (0.12, 0.04), (0, 0.045)], "CS_Brass", segs=12)
            cylinder(M, (px, 0.04, pz), (px, 0.9, pz), 0.032, "CS_Brass", sides=8)
            blob(M, px, 0.93, pz, 0.055, 0.055, 0.055, "CS_Brass", cuts=2)
        for (pa, qa), (pb, qb) in zip(posts, posts[1:]):
            seg = 8
            pts = [(pa + (pb - pa) * k / seg, 0.84 - 0.14 * 4 * (k / seg) * (1 - k / seg), qa + (qb - qa) * k / seg) for k in range(seg + 1)]
            for u, v in zip(pts, pts[1:]):
                cylinder(M, u, v, 0.028, "CS_Velvet", sides=8)


# ---------------------------------------------------------------------------------------------
# 5 the Velvet Lounge & Jazz Bar


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


def build_lounge(M, L, cushions):
    b = L["bar"]
    x0, x1, z0, z1 = b["x0"], b["x1"], b["z0"], b["z1"]
    top = b["top"]
    face_x = -L["half"] + L["walls"]["t"]
    # the back bar: a cabinet, a mirror, two shelves of bottles, a glowing strip, a stepped crest
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
            if (k * 7) % 5 != 0:
                bottle(M, face_x + 0.16 + (0.1 if y == 1.04 else 0), zz, y, k)
            zz += 0.2
            k += 1
    # the counter: a fluted mahogany front, a mahogany top with a gold nosing, returns to the wall,
    # a brass foot rail
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
    # on the counter: a cocktail shaker, a few glasses
    lathe(M, x1 - 0.18, z0 + 1.2, [(0, 0), (0.045, 0), (0.05, 0.14), (0.03, 0.2), (0, 0.22)], "CS_Brass", segs=12, y0=top)
    for zz in (z0 + 2.3, z0 + 3.6, z0 + 4.9):
        lathe(M, x1 - 0.15, zz, [(0, 0), (0.035, 0), (0.01, 0.02), (0.01, 0.08), (0.05, 0.13), (0, 0.13)], "CS_Ivory", segs=10, y0=top)
    seat = cushions["barStool"]["top"]
    for zz in b["stools"]:
        stool(M, b["stoolX"], zz, seat)
    # the cocktail tables (a brass pedestal, a marble top, a little lamp) and their club chairs
    club = cushions["clubChair"]["top"]
    for t in L["cocktails"]:
        lathe(M, t["x"], t["z"], [(0, 0), (0.22, 0), (0.2, 0.03), (0.035, 0.06), (0.03, 0.5), (0.08, 0.52), (0, 0.52)], "CS_Brass", segs=14)
        lathe(M, t["x"], t["z"], [(0, 0.52), (0.3, 0.52), (0.3, 0.55), (0, 0.55)], "CS_MarbleLight", segs=20)
        lathe(M, t["x"], t["z"], [(0, 0.55), (0.04, 0.55), (0.02, 0.62), (0, 0.62)], "CS_Brass", segs=8)
        lathe(M, t["x"], t["z"], [(0, 0.62), (0.07, 0.62), (0.04, 0.7), (0, 0.7)], "CS_Bulb", segs=10)
        for side in (-1, 1):
            club_chair(M, t["x"] + side * 0.85, t["z"], math.pi / 2 if side < 0 else -math.pi / 2, club)
    # the baby grand: black lacquer, ivory keys, three legs and a gold lyre; its bench
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


# ---------------------------------------------------------------------------------------------
# the front rail, the chandeliers


def build_rail(M, L):
    e = L["half"] - 0.1
    h = L["half"]
    # along the right edge from the cage's end, along the front from the left wall
    for a, b in (((e, L["cage"]["z1"] + 0.15), (e, e)), ((-h + 0.25, e), (e, e))):
        cylinder(M, (a[0], 0.34, a[1]), (b[0], 0.34, b[1]), 0.03, "CS_Brass", sides=10)
        n = round(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.3)
        for k in range(n + 1):
            px, pz = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
            cylinder(M, (px, 0.0, pz), (px, 0.34, pz), 0.022, "CS_Brass", sides=8)


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
    build_floor(M, L)
    build_walls(M, L)
    build_cage(M, L)
    build_foyer(M, L, cushions)
    build_roulette(M, L)
    build_blackjack(M, L, cushions)
    build_alley(M, L)
    build_pit(M, L, cushions)
    build_lounge(M, L, cushions)
    build_rail(M, L)
    build_chandeliers(M, L)
    make_object("Casino_Static", M, coll)
    wheel, origin = build_wheel(L)
    make_object("Prop_RouletteWheel", wheel, coll, origin=origin)
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
    for o in coll.all_objects:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        # reported in the game's axes: x, y (up), z
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
