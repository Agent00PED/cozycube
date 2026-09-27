"""Every fish in the game, for the reveal's turntable and the Nature Logbook: builds
client/public/models/fish.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_fish.py

One node per species in shared/fishing.ts FISH (the builder reads the ids from there and fails if
one has no look here): `Fish_<id>`, about a metre long, nose along +x, back up, every colour a vertex
colour in ONE matte clay material (a draw call each). Each is lofted from its kind's body (a
streamlined swimmer, a deep-bodied panfish, a long pike, an eel, a flat-headed sculpin, a whiskered
catfish, a shovel-snouted paddlefish, a koi, a jellyfish's bell, a whale), with its fins, its tail
and its markings (bars, spots, a lateral line, bands, glowing freckles) painted on. Laid out in rows
in the collection (the game centres each one on its own stand).

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Fish"
MATERIAL = "FS_Clay"


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def W(x, y, z):
    return Vector((x, -z, y))


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_fish.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def species_ids(root):
    src = open(os.path.join(root, "shared", "fishing.ts"), encoding="utf-8").read()
    return re.findall(r"^  ([a-z_]+): \{ name: \"[^\"]+\", emoji: \"[^\"]+\", water: ", src, re.M)


# ---------------------------------------------------------------------------------------------
# the looks: body kind, proportions, colours (back, flank, belly, fins), markings

# body kinds: "swim" (streamlined), "deep" (a panfish), "long" (pike and gar), "eel", "flat" (the
# sculpin's wide head), "cat" (whiskers), "paddle" (the paddlefish's snout), "koi", "sturgeon",
# "arowana", "jelly", "whale", "serpent" (the leviathan)
LOOKS = {
    "minnow": dict(body="swim", h=0.14, back="#6E7F6A", flank="#B9C4B0", belly="#EDEFE6", fin="#9AA590", marks=[("line", "#3E4A3C")]),
    "perch": dict(body="deep", h=0.2, back="#5C7A3A", flank="#C9B84A", belly="#F1E7C8", fin="#E07A3A", marks=[("bars", "#2F4A26", 6)], dorsal="spiny"),
    "bluegill": dict(body="deep", h=0.3, back="#3F5E6E", flank="#7F9E7A", belly="#F0A24A", fin="#4E6C76", marks=[("bars", "#3A5060", 6), ("gill", "#1E2E40")]),
    "dace": dict(body="swim", h=0.15, back="#6B7A86", flank="#D2DAE0", belly="#F4F6F4", fin="#B8C2C8", marks=[("line", "#8A96A0")]),
    "chub": dict(body="swim", h=0.18, back="#5E5A48", flank="#B7AE8C", belly="#EDE6D2", fin="#C47A5A", marks=[("scales", "#8E866A")]),
    "trout": dict(body="swim", h=0.17, back="#5E6E48", flank="#C7B98C", belly="#F2EAD8", fin="#A89A6A", marks=[("spots", "#2E2A22", 0.5), ("line", "#D9727A")]),
    "smallmouth_bass": dict(body="swim", h=0.21, back="#5E5A2E", flank="#A89A58", belly="#EFE6C0", fin="#8C7E48", marks=[("bars", "#4A4222", 7)], dorsal="spiny"),
    "grayling": dict(body="swim", h=0.16, back="#5A6470", flank="#A8AEB8", belly="#E8EAEA", fin="#8A6AA8", marks=[("spots", "#2A2E36", 0.3)], dorsal="sail"),
    "pike": dict(body="long", h=0.1, back="#3E5A34", flank="#7E9A5A", belly="#E9E6C8", fin="#9A7A48", marks=[("spots", "#DCE6A8", 0.8)]),
    "salmon": dict(body="swim", h=0.18, back="#6A5A6A", flank="#D8736A", belly="#F4E4DA", fin="#8A5A5A", marks=[("spots", "#3A2A2A", 0.35)]),
    "golden_trout": dict(body="swim", h=0.17, back="#A8842A", flank="#F2C24A", belly="#F28A4A", fin="#E86A3A", marks=[("line", "#E8484A"), ("spots", "#5A3A1A", 0.3), ("parr", "#6A5A2A")]),
    "muskellunge": dict(body="long", h=0.11, back="#5A6A3A", flank="#B8B07A", belly="#EFEAD2", fin="#A8783A", marks=[("bars", "#4A5028", 9)]),
    "golden_arowana": dict(body="arowana", h=0.16, back="#D9A838", flank="#F7D46A", belly="#FBEAB0", fin="#E8A030", marks=[("scales", "#C08A1E")]),
    "dawn_paddlefish": dict(body="paddle", h=0.12, back="#6E7FA8", flank="#E8A8B8", belly="#FBE8D8", fin="#9A8AB8", marks=[("spots", "#FFE0A0", 0.25)]),
    "sunfire_koi": dict(body="koi", h=0.17, back="#E8482A", flank="#F7A03A", belly="#FFF1D8", fin="#F7C04A", marks=[("patches", "#FFF4E0", 5), ("glow", "#FFE08A")]),
    "bullhead": dict(body="cat", h=0.14, back="#4A3A2A", flank="#7A6040", belly="#E8DCC0", fin="#5A4630", marks=[("mottle", "#3A2A1C", 0.5)]),
    "moon_shiner": dict(body="swim", h=0.15, back="#4E5E8A", flank="#C8D4F0", belly="#F4F6FF", fin="#A8B8E0", marks=[("line", "#E8F0FF"), ("glow", "#DDE8FF")]),
    "stone_loach": dict(body="eel", h=0.08, back="#6A5E48", flank="#A8987A", belly="#E4D8C0", fin="#8A7E68", marks=[("mottle", "#4A4030", 0.7)], whiskers=True),
    "sculpin": dict(body="flat", h=0.12, back="#5A5A3E", flank="#8A8A62", belly="#D8D4B8", fin="#6A6A48", marks=[("mottle", "#3A3A26", 0.8)]),
    "glass_eel": dict(body="eel", h=0.05, back="#C8E4E8", flank="#E4F4F4", belly="#F8FCFC", fin="#D8F0F0", marks=[("line", "#9AC8D0")]),
    "catfish": dict(body="cat", h=0.15, back="#4A5260", flank="#8A94A0", belly="#ECEAE4", fin="#5A6270", marks=[("spots", "#2A3038", 0.25)]),
    "burbot": dict(body="eel", h=0.1, back="#5A5236", flank="#9A8E5A", belly="#E4DCB8", fin="#6A6040", marks=[("mottle", "#3A3420", 0.7)], whiskers=True),
    "walleye": dict(body="long", h=0.13, back="#6A6A3A", flank="#C8B85A", belly="#F4EED8", fin="#9A8A48", marks=[("bars", "#4A4826", 5)], dorsal="spiny", big_eye=True),
    "lantern_perch": dict(body="deep", h=0.2, back="#2E4A5A", flank="#4E7A8A", belly="#D8E8E0", fin="#3E6A7A", marks=[("glow", "#F7D46A"), ("bars", "#223844", 5)], dorsal="spiny", lure=True),
    "sturgeon": dict(body="sturgeon", h=0.11, back="#5A6470", flank="#9AA4AE", belly="#ECECE8", fin="#6A7480", marks=[("scutes", "#D8DCE0")], whiskers=True),
    "ghost_carp": dict(body="koi", h=0.19, back="#C8CCD0", flank="#EEF0F2", belly="#FFFFFF", fin="#DCE0E4", marks=[("scales", "#B8BCC4")]),
    "silver_gar": dict(body="gar", h=0.07, back="#6A7A86", flank="#D0D8DE", belly="#F4F6F6", fin="#9AA8B0", marks=[("line", "#A8B4BC")]),
    "abyssal_koi": dict(body="koi", h=0.17, back="#1E1E3A", flank="#3A3A7A", belly="#8A8AC8", fin="#5A4AA8", marks=[("patches", "#8FF0D8", 4), ("glow", "#8FF0D8")]),
    "starlight_eel": dict(body="eel", h=0.07, back="#1A2248", flank="#2E3A7A", belly="#8A9AD8", fin="#4A5AA8", marks=[("glow", "#FFF1B8"), ("spots", "#FFF1B8", 0.4)]),
    "moonveil_leviathan": dict(body="serpent", h=0.08, back="#2A3A5A", flank="#8AA8D8", belly="#E8F0FF", fin="#C84A6A", marks=[("glow", "#DDE8FF"), ("line", "#E8F0FF")]),
    "sand_sardine": dict(body="swim", h=0.13, back="#3E6A8A", flank="#C8D8E0", belly="#F4F8FA", fin="#A8B8C4", marks=[("spots", "#2A4A6A", 0.3)]),
    "sunset_clownfish": dict(body="deep", h=0.22, back="#F07A2A", flank="#F7942E", belly="#F7B45A", fin="#E86A1A", marks=[("bands", "#FFFFFF", 3)], tail="round"),
    "prism_jellyfish": dict(body="jelly", h=0.3, back="#C8A8F0", flank="#E8C8F8", belly="#F8E8FF", fin="#A8E0F8", marks=[("glow", "#FFFFFF")]),
    "pearl_whale": dict(body="whale", h=0.22, back="#4A5A7A", flank="#8A9AB8", belly="#F0F2F4", fin="#5A6A8A", marks=[("spots", "#F8F4E8", 0.3)]),
}


# ---------------------------------------------------------------------------------------------
# plumbing: one vertex-coloured clay material


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


def clay():
    m = bpy.data.materials.get(MATERIAL) or bpy.data.materials.new(MATERIAL)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) or nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.6
    m.use_backface_culling = True
    return m


class Fish:
    """A fish's mesh as it is built: its faces, each vertex's colour picked by `paint`."""

    def __init__(self):
        self.bm = bmesh.new()
        self.vc = self.bm.verts.layers.float_color.new("vc")  # each vertex's colour

    def vert(self, p, rgb):
        v = self.bm.verts.new(p)
        v[self.vc] = (*rgb, 1.0)
        return v

    def face(self, vs, smooth=True):
        f = self.bm.faces.new(vs)
        f.smooth = smooth
        return f


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hash01(a, b):
    v = math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return v - math.floor(v)


# ---------------------------------------------------------------------------------------------
# the body: a loft of elliptic rings from the tail's root (u = 0) to the nose (u = 1)


def profile(kind, u, H):
    """(half height, half width, centre height) of the body at u."""
    s = max(0.0, min(1.0, u))
    if kind in ("eel", "serpent"):
        f = 0.35 + 0.65 * math.sin(math.pi * min(1.0, s * 1.05)) ** 0.25
        h = H * f * (1.0 if s < 0.92 else math.sqrt(max(0.0, (1 - s) / 0.08)))
        return h, h * 0.75, 0.0
    if kind == "deep":
        f = 0.2 + 0.8 * math.sin(math.pi * s ** 1.05) ** 0.7
        h = H * f * (1.0 if s < 0.9 else math.sqrt(max(0.0, (1 - s) / 0.1)) * 0.9 + 0.1 * (1 - s) / 0.1)
        return h, h * 0.42, 0.0
    if kind in ("long", "gar"):
        f = 0.3 + 0.7 * math.sin(math.pi * s ** 0.9) ** 0.45
        taper = 1.0 if s < 0.8 else max(0.0, (1 - s) / 0.2) ** (0.9 if kind == "long" else 0.4)
        h = H * f * taper
        return h, h * 0.62, 0.0
    if kind in ("flat", "cat"):
        f = 0.25 + 0.75 * math.sin(math.pi * s ** 1.3) ** 0.6
        h = H * f * (1.0 if s < 0.93 else math.sqrt(max(0.0, (1 - s) / 0.07)))
        wide = 1.25 if kind == "flat" else 1.05
        return h, h * (0.6 + (wide - 0.6) * s ** 2), -H * 0.1 * s
    if kind == "whale":
        f = 0.15 + 0.85 * math.sin(math.pi * min(1.0, s * 0.98 + 0.02) ** 1.4) ** 0.55
        h = H * f * (1.0 if s < 0.95 else math.sqrt(max(0.0, (1 - s) / 0.05)))
        return h, h * 0.95, 0.0
    # swim, koi, arowana, paddle, sturgeon
    f = 0.24 + 0.76 * math.sin(math.pi * s ** 1.1) ** 0.72
    h = H * f * (1.0 if s < 0.9 else math.sqrt(max(0.0, (1 - s) / 0.1)))
    return h, h * (0.5 if kind != "sturgeon" else 0.62), 0.0


def body_colour(look, u, a, y_rel, x, z):
    """A body vertex's colour: back to flank to belly by height, then the markings."""
    back, flank, belly = lin(look["back"]), lin(look["flank"]), lin(look["belly"])
    t = (1 - y_rel) / 2  # 0 at the top, 1 underneath
    c = mix(back, flank, min(1.0, t / 0.5)) if t < 0.5 else mix(flank, belly, min(1.0, (t - 0.5) / 0.35))
    for mark in look.get("marks", []):
        kind, colour = mark[0], lin(mark[1])
        if kind == "bars" and y_rel > -0.35:
            n = mark[2]
            if math.sin(u * n * math.pi * 2 + 1.0) > 0.45 and 0.12 < u < 0.82:
                c = mix(c, colour, 0.75)
        elif kind == "bands":
            for k in range(mark[2]):
                centre = 0.18 + k * 0.3
                if abs(u - centre) < 0.045:
                    c = colour
                elif abs(u - centre) < 0.06:
                    c = lin("#1A1A1A")
        elif kind == "line" and abs(y_rel - 0.05) < 0.07 and 0.08 < u < 0.85:
            c = mix(c, colour, 0.85)
        elif kind == "spots" and y_rel > -0.25:
            if hash01(round(u * 40), round(a * 6)) < mark[2] * 0.35:
                c = mix(c, colour, 0.9)
        elif kind == "mottle":
            if hash01(round(u * 18), round(a * 3)) < mark[2] * 0.5 and y_rel > -0.4:
                c = mix(c, colour, 0.7)
        elif kind == "patches":
            k = hash01(round(u * mark[2]), round(a * 1.2 + 3))
            if k < 0.45 and y_rel > -0.5:
                c = colour
        elif kind == "scales":
            if (round(u * 36) + round(a * 5)) % 2 == 0 and y_rel > -0.5:
                c = mix(c, colour, 0.35)
        elif kind == "glow":
            if hash01(round(u * 30), round(a * 5) + 7) < 0.12 and y_rel > -0.6:
                c = colour
        elif kind == "gill" and 0.74 < u < 0.8 and abs(y_rel) < 0.3:
            c = colour
        elif kind == "parr" and 0.15 < u < 0.8 and abs(y_rel) < 0.2 and math.sin(u * 40) > 0.6:
            c = mix(c, colour, 0.6)
        elif kind == "scutes" and (y_rel > 0.85 or abs(abs(y_rel) - 0.1) < 0.05) and math.sin(u * 60) > 0.2:
            c = colour
    return c


def loft(F, look, length, x0, rings=34, sides=14):
    kind = look["body"]
    H = look["h"]
    rows = []
    for i in range(rings + 1):
        u = i / rings
        h, w, cy = profile(kind, u, H)
        x = x0 + u * length
        row = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            y = cy + h * math.cos(a)
            z = w * math.sin(a)
            row.append(F.vert(W(x, y, z), body_colour(look, u, a, math.cos(a), x, z)))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(sides):
            k1 = (k + 1) % sides
            F.face((r0[k], r1[k], r1[k1], r0[k1]))
    # close the tail's root and the nose
    F.face(list(reversed(rows[0])))
    tip = F.vert(W(x0 + length + 0.004, profile(kind, 1.0, H)[2], 0.0), lin(look["flank"]))
    for k in range(sides):
        F.face((rows[-1][k], tip, rows[-1][(k + 1) % sides]))


def fin(F, pts, colour, thick=0.008, flat=False):
    """A flat fin: the (x, y) outline `pts` in the fish's mid-plane, `thick` through, closed (or,
    `flat`, the (x, z) outline lying level at y = 0: a whale's flukes)."""
    c = lin(colour)
    if flat:
        a = [F.vert(W(x, -thick / 2, z), c) for x, z in pts]
        b = [F.vert(W(x, thick / 2, z), c) for x, z in pts]
    else:
        a = [F.vert(W(x, y, -thick / 2), c) for x, y in pts]
        b = [F.vert(W(x, y, thick / 2), c) for x, y in pts]
    F.face(a, smooth=False)
    F.face(list(reversed(b)), smooth=False)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        F.face((a[i], a[j], b[j], b[i]), smooth=False)


def side_fin(F, x, y, z, ln, wd, colour, drop=0.3):
    """A paired fin (pectoral or pelvic) on each side, swept back and down."""
    c = lin(colour)
    for sz in (-1, 1):
        pts = [(x, y, z * sz), (x - ln, y - drop * ln, (z + wd * 0.6) * sz), (x - ln * 0.7, y - drop * ln - wd * 0.5, (z + wd) * sz)]
        a = [F.vert(W(px, py, pz), c) for px, py, pz in pts]
        b = [F.vert(W(px, py - 0.006, pz), c) for px, py, pz in pts]
        F.face(a, smooth=False)
        F.face(list(reversed(b)), smooth=False)
        for i in range(3):
            j = (i + 1) % 3
            F.face((a[i], a[j], b[j], b[i]), smooth=False)


def blob(F, cx, cy, cz, r, colour, cuts=2):
    for v in F.bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(F.bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(F.bm, edges=edges, cuts=cuts, use_grid_fill=True)
    c = (*lin(colour), 1.0)
    new = [v for v in F.bm.verts if not v.tag]
    for v in new:
        d = v.co.normalized()
        v.co = W(cx + d.x * r, cy + d.z * r, cz - d.y * r)
        v[F.vc] = c
    for f in {f for v in new for f in v.link_faces}:
        f.smooth = True
    for v in F.bm.verts:
        v.tag = False


def whisker(F, a, b, r, colour):
    c = lin(colour)
    a, b = W(*a), W(*b)
    axis = (b - a).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    ra = [F.vert(a + (n * math.cos(t) + q * math.sin(t)) * r, c) for t in (2 * math.pi * k / 5 for k in range(5))]
    rb = [F.vert(b + (n * math.cos(t) + q * math.sin(t)) * r * 0.4, c) for t in (2 * math.pi * k / 5 for k in range(5))]
    for k in range(5):
        k1 = (k + 1) % 5
        F.face((ra[k], ra[k1], rb[k1], rb[k]))
    F.face(list(reversed(ra)))
    F.face(rb)


def build_fish(sid, look, coll, at):
    F = Fish()
    kind = look["body"]
    H = look["h"]
    finc = look["fin"]
    if kind == "jelly":
        # a bell and trailing tentacles (it swims up: the bell's dome along +x)
        c_top, c_rim = lin(look["back"]), lin(look["belly"])
        rows = []
        for i in range(13):
            t = i / 12
            ang = t * math.pi / 2
            rr = 0.32 * math.sin(ang) + 0.02
            x = 0.25 + 0.2 * math.cos(ang)
            row = [F.vert(W(x, rr * math.cos(2 * math.pi * k / 16), rr * math.sin(2 * math.pi * k / 16)), mix(c_top, c_rim, t)) for k in range(16)]
            rows.append(row)
        for r0, r1 in zip(rows, rows[1:]):
            for k in range(16):
                k1 = (k + 1) % 16
                F.face((r0[k], r0[k1], r1[k1], r1[k]))
        F.face(rows[0])
        F.face(list(reversed(rows[-1])))
        for k in range(8):
            a = 2 * math.pi * k / 8
            y, z = 0.22 * math.cos(a), 0.22 * math.sin(a)
            whisker(F, (0.25, y, z), (-0.5 - 0.1 * (k % 3), y * 0.6 + 0.04 * math.sin(k), z * 0.6), 0.018, look["fin"] if k % 2 else look["flank"])
        blob(F, 0.3, 0.0, 0.0, 0.08, "#FFFFFF")
    else:
        length = 1.0
        x0 = -0.5
        if kind == "paddle":
            length = 0.72
        if kind == "gar":
            length = 0.8
        loft(F, look, length, x0)
        head_u = 0.86
        hx = x0 + head_u * length
        hh, hw, hc = profile(kind, head_u, H)
        # the eyes (big for the walleye), a glint in each
        er = 0.022 if not look.get("big_eye") else 0.032
        if kind in ("eel", "serpent"):
            er = 0.016
        for sz in (-1, 1):
            blob(F, hx, hc + hh * 0.35, sz * hw * 0.92, er, "#15131A")
            blob(F, hx + er * 0.3, hc + hh * 0.35 + er * 0.4, sz * (hw * 0.92 + er * 0.7), er * 0.3, "#FFFFFF", cuts=1)
        tail_x = x0
        th = profile(kind, 0.0, H)[0]
        tail = look.get("tail", "fork")
        # the tail fin
        if kind in ("eel", "serpent"):
            fin(F, [(tail_x + 0.02, th), (tail_x - 0.12, th * 1.8), (tail_x - 0.16, 0.0), (tail_x - 0.12, -th * 1.8), (tail_x + 0.02, -th)], finc)
        elif kind == "whale":
            fin(F, [(tail_x + 0.03, 0.04), (tail_x - 0.12, 0.26), (tail_x - 0.2, 0.22), (tail_x - 0.1, 0.0), (tail_x - 0.2, -0.22), (tail_x - 0.12, -0.26), (tail_x + 0.03, -0.04)], finc, thick=0.02, flat=True)
        elif tail == "round":
            fin(F, [(tail_x + 0.03, th * 0.9), (tail_x - 0.1, th * 1.9), (tail_x - 0.16, 0.0), (tail_x - 0.1, -th * 1.9), (tail_x + 0.03, -th * 0.9)], finc)
        else:
            spread = 0.17 if kind not in ("long", "gar") else 0.12
            fin(F, [(tail_x + 0.03, th * 0.8), (tail_x - 0.16, spread + th), (tail_x - 0.1, 0.0), (tail_x - 0.16, -spread - th), (tail_x + 0.03, -th * 0.8)], finc)
        # the dorsal fin
        top = lambda u: x0 + u * length, lambda u: profile(kind, u, H)[2] + profile(kind, u, H)[0]
        ux, uy = top
        dorsal = look.get("dorsal", "soft")
        if kind in ("eel", "serpent"):
            pts = [(ux(u), uy(u) - 0.005) for u in (0.05, 0.75)]
            crest = 0.05 if kind == "eel" else 0.14
            fin(F, [pts[0], (ux(0.3), uy(0.3) + crest * 0.8), (ux(0.6), uy(0.6) + crest), (ux(0.8), uy(0.8) + crest * 1.3), pts[1]], finc)
        elif kind == "whale":
            fin(F, [(ux(0.3), uy(0.3) - 0.01), (ux(0.33), uy(0.33) + 0.06), (ux(0.42), uy(0.42) - 0.01)], finc)
        elif dorsal == "sail":
            fin(F, [(ux(0.35), uy(0.35) - 0.01), (ux(0.42), uy(0.42) + 0.2), (ux(0.7), uy(0.7) + 0.16), (ux(0.72), uy(0.72) - 0.01)], finc)
        elif dorsal == "spiny":
            fin(F, [(ux(0.3), uy(0.3) - 0.01), (ux(0.4), uy(0.4) + 0.1), (ux(0.5), uy(0.5) + 0.07), (ux(0.58), uy(0.58) + 0.12), (ux(0.68), uy(0.68) + 0.05), (ux(0.7), uy(0.7) - 0.01)], finc)
        elif kind == "arowana":
            fin(F, [(ux(0.05), uy(0.05) - 0.01), (ux(0.1), uy(0.1) + 0.08), (ux(0.32), uy(0.32) + 0.03), (ux(0.34), uy(0.34) - 0.01)], finc)
            fin(F, [(ux(0.05), -uy(0.05) + 0.01), (ux(0.1), -uy(0.1) - 0.1), (ux(0.4), -uy(0.4) - 0.02), (ux(0.42), -uy(0.42) + 0.01)], finc)
        else:
            fin(F, [(ux(0.38), uy(0.38) - 0.01), (ux(0.45), uy(0.45) + 0.09), (ux(0.62), uy(0.62) + 0.04), (ux(0.64), uy(0.64) - 0.01)], finc)
        # the paired fins, and an anal fin
        if kind not in ("eel", "serpent"):
            side_fin(F, x0 + 0.74 * length, hc - hh * 0.35, hw * 0.8, 0.12 if kind != "whale" else 0.2, 0.05, finc, drop=0.35)
            side_fin(F, x0 + 0.45 * length, profile(kind, 0.45, H)[2] - profile(kind, 0.45, H)[0] * 0.8, profile(kind, 0.45, H)[1] * 0.5, 0.07, 0.03, finc, drop=0.5)
            if kind != "whale":
                ub = lambda u: profile(kind, u, H)[2] - profile(kind, u, H)[0]
                fin(F, [(ux(0.2), ub(0.2) + 0.01), (ux(0.24), ub(0.24) - 0.06), (ux(0.34), ub(0.34) - 0.03), (ux(0.36), ub(0.36) + 0.01)], finc)
        # the snouts and whiskers
        nose_x = x0 + length
        if kind == "paddle":
            c = look["fin"]
            fin(F, [(nose_x - 0.02, 0.01), (nose_x + 0.2, 0.04), (nose_x + 0.3, 0.02), (nose_x + 0.3, -0.02), (nose_x + 0.2, -0.03), (nose_x - 0.02, -0.02)], look["back"], thick=0.06)
        if kind == "sturgeon":
            fin(F, [(nose_x - 0.02, 0.0), (nose_x + 0.12, 0.0), (nose_x - 0.02, -0.04)], look["back"], thick=0.05)
        if kind in ("cat",) or look.get("whiskers") or kind == "koi":
            n = 4 if kind == "cat" else 2
            for k in range(n):
                sz = 1 if k % 2 else -1
                ln = 0.2 if kind == "cat" else 0.08
                whisker(F, (nose_x - 0.03, hc - hh * 0.2 - k * 0.012, sz * hw * 0.4), (nose_x - 0.03 - ln * 0.4, hc - hh * 0.6 - ln * 0.5, sz * (hw + ln * 0.8)), 0.008, "#3A2E28" if kind == "cat" else look["fin"])
        if look.get("lure"):
            whisker(F, (x0 + 0.8 * length, uy(0.8), 0.0), (nose_x + 0.08, uy(0.8) + 0.12, 0.0), 0.006, look["fin"])
            blob(F, nose_x + 0.09, uy(0.8) + 0.13, 0.0, 0.03, "#F7D46A")
        if kind == "whale":
            for sz in (-1, 1):
                blob(F, x0 + 0.72, 0.03, sz * 0.19, 0.015, "#15131A", cuts=1)
    # to a node: the vertex colours into a "Col" layer, the one clay material
    bm = F.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    for f in bm.faces:
        for loop in f.loops:
            loop[col] = loop.vert[F.vc]
    bm.verts.layers.float_color.remove(F.vc)  # (only the corner colours go out)
    me = bpy.data.meshes.new(f"Fish_{sid}Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(clay())
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(f"Fish_{sid}", me)
    coll.objects.link(ob)
    ob.location = W(*at)
    return ob


def build(root):
    purge()
    ids = species_ids(root)
    missing = [i for i in ids if i not in LOOKS]
    if missing:
        raise RuntimeError(f"no look for: {missing}")
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    for k, sid in enumerate(ids):
        build_fish(sid, LOOKS[sid], coll, ((k % 6) * 1.6, -(k // 6) * 0.8, 0.0))
    return coll, ids


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


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll, ids = build(root)
        out = os.path.join(root, "client", "public", "models", "fish.glb")
        export(coll, out)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in coll.all_objects if o.data)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "species": len(ids), "tris": tris}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
