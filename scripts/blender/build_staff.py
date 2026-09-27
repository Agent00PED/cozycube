"""The Cozy Lounge's staff: builds client/public/models/chloe_maid.glb, Chloe the cat maid of the
Velvet Boutique and her ornate gilded cheval mirror (shared/worlds/lounge.ts BOUTIQUE places both).

Run it inside Blender through the Live Bridge (POST {"code": ...}; queued, nothing comes back, and
it execs with separate globals and locals, so run this file inside a namespace of its own with
REPO_ROOT and REPORT_PATH set in it: the summary or the traceback goes to REPORT_PATH), or
headless:

    blender -b -P scripts/blender/build_staff.py

Built the way the casino's staff are (scripts/blender/build_casino_staff.py): every colour a vertex
colour, each node ONE matte clay material. Two roots, each standing at its own origin facing +z
(the game places and turns each on its own):

    Chloe                   a chibi calico cat maid in Victorian black and white: a long black dress
                            over a frilled white petticoat, a white apron with lace edging and a bow
                            tied at the back, puffed sleeves with white cuffs, a round white collar
                            with a big red velvet bow, a lace headband between her ears, green eyes
      Chloe_Body            the dress, the apron, the collar and the bow (holds still; it breathes)
        Chloe_Head          pivots at the neck: she looks at whoever comes near
        Chloe_ArmR          pivots at the shoulder: she waves (a curtsy's flourish) with it
        Chloe_ArmL          pivots at the shoulder: a feather duster in her paw
        Chloe_Tail          pivots where it leaves the skirt: it sways
    Mirror                  the cheval mirror: an oval glass in a gilded frame hung between two
                            turned uprights on scrolled feet, a shell crest on top
      Mirror_Frame          the frame, the stand and the backing (one clay material)
      Mirror_Glass          the glass (its own material: the game gives it a moving sheen)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "ChloeMaid"
MATERIAL = "SF_Clay"
GLASS_MATERIAL = "SF_Glass"

PALETTE = {
    "Eye": "#1B1818",
    "Glint": "#FFFFFF",
    "Blush": "#EDA0A0",
    # Chloe
    "Fur": "#F6EBDD",
    "Ginger": "#E39A52",
    "Tabby": "#4A3C36",
    "Nose": "#E58E98",
    "EarPink": "#E7A3A8",
    "CatEye": "#5DB87A",
    "Dress": "#1E1B22",
    "DressShade": "#2C2830",
    "Lace": "#FBF8F1",
    "LaceShade": "#E9E3D6",
    "Velvet": "#B3263A",
    "VelvetDark": "#86182A",
    "Shoe": "#141216",
    "Wood": "#6B4128",
    "Feather": "#EFA7B8",
    "FeatherLight": "#F8D3DC",
    # the mirror
    "Gilt": "#D8AE45",
    "GiltDark": "#A67E2A",
    "Backing": "#3A2418",
    "Glass": "#C9D9E6",
}


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
    if "__file__" in globals() and __file__.endswith("build_staff.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# ---------------------------------------------------------------------------------------------
# shapes: each adds faces to a Part in a colour slot `c` (a name from PALETTE)


class Part:
    def __init__(self):
        self.bm = bmesh.new()
        self.colours = []

    def c(self, name):
        if name not in self.colours:
            self.colours.append(name)
        return self.colours.index(name)


def cylinder(P, a, b, r, c, sides=10, r_end=None):
    bm, m = P.bm, P.c(c)
    a, b = W(*a), W(*b)
    axis = (b - a).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    re_ = r if r_end is None else r_end
    ring_a = [bm.verts.new(a + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    ring_b = [bm.verts.new(b + (n * math.cos(t) + q * math.sin(t)) * re_) for t in (2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        k1 = (k + 1) % sides
        f = bm.faces.new((ring_a[k], ring_a[k1], ring_b[k1], ring_b[k]))
        f.material_index = m
        f.smooth = True
    for ring in (ring_a, list(reversed(ring_b))):
        bm.faces.new(ring).material_index = m


def lathe(P, cx, cz, profile, c, segs=14, y0=0.0):
    bm, m = P.bm, P.c(c)
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = [[bm.verts.new(W(cx + r * math.cos(2 * math.pi * k / segs), y0 + h, cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)] for r, h in profile[1:-1]]
    for k in range(segs):
        k1 = (k + 1) % segs
        faces = [bm.faces.new((bottom, rings[0][k1], rings[0][k])), bm.faces.new((top, rings[-1][k], rings[-1][k1]))]
        faces += [bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])) for r0, r1 in zip(rings, rings[1:])]
        for f in faces:
            f.material_index = m
            f.smooth = True


def blob(P, cx, cy, cz, hx, hy, hz, c, cuts=3, n=2.2, top=None, bottom=None, tilt=0.0, yaw=0.0):
    """A rounded lump (a superellipsoid) centred at (cx, cy, cz), optionally cut flat at `top` /
    `bottom`, leaned forward by `tilt` (radians about x) and turned by `yaw` (about y)."""
    bm, m = P.bm, P.c(c)
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    cs, sn = math.cos(tilt), math.sin(tilt)
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        x, y, z = q.x * hx, q.z * hy, -q.y * hz
        y, z = y * cs - z * sn, y * sn + z * cs
        x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_
        y += cy
        if top is not None:
            y = min(y, top)
        if bottom is not None:
            y = max(y, bottom)
        v.co = W(cx + x, y, cz + z)
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = m
        f.smooth = True
    for v in bm.verts:
        v.tag = False


def swept(P, pts, r, c, sides=8, r_end=None):
    """A tube through `pts` (game points), a ball at every joint so it bends smoothly."""
    n = len(pts) - 1
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        ra = r if r_end is None else r + (r_end - r) * k / n
        rb = r if r_end is None else r + (r_end - r) * (k + 1) / n
        cylinder(P, a, b, ra, c, sides=sides, r_end=rb)
        blob(P, b[0], b[1], b[2], rb, rb, rb, c, cuts=1)


# ---------------------------------------------------------------------------------------------
# Blender plumbing: vertex-coloured clay


def studio(root, call, *args):
    """The Blender studio (scripts/blender/studio.py, run fresh from disk): "begin" before the
    build (a headless run joins the master file), "finish" after the export (the collections to
    their place on the studio grid, the .blend saved). A studio failure never fails the export."""
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


def purge(name):
    old = bpy.data.collections.get(name)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def clay(name=MATERIAL, roughness=0.8, metallic=0.0):
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
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    m.roughness = roughness
    m.use_backface_culling = True
    return m


def node(name, P, coll, parent=None, pivot=(0.0, 0.0, 0.0), material=None):
    """The part `P` as a mesh object `name`, origin at the game point `pivot`, under `parent`: each
    face painted its slot's colour, all in one clay material."""
    bm = P.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    rgba = [(*lin(PALETTE[c]), 1.0) for c in P.colours]
    for f in bm.faces:
        for loop in f.loops:
            loop[col] = rgba[f.material_index]
        f.material_index = 0
    shift = W(*pivot)
    for v in bm.verts:
        v.co -= shift
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material or clay())
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob["pivot"] = list(pivot)
    if parent is None:
        ob.location = W(*pivot)
    else:
        ob.parent = parent
        pp = parent["pivot"]
        ob.location = W(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2])
    return ob


def root(name, coll, at=(0.0, 0.0, 0.0)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = "PLAIN_AXES"
    coll.objects.link(ob)
    ob["pivot"] = list(at)
    ob.location = W(*at)
    return ob


def eyes(P, x, y, z, hx, hy, eye="Eye", pupil=None):
    for sx in (-1, 1):
        blob(P, sx * x, y, z, hx, hy, 0.02, eye, cuts=2)
        if pupil:
            blob(P, sx * x, y, z + 0.013, hx * 0.32, hy * 0.82, 0.012, pupil, cuts=1)
        blob(P, sx * x - 0.009, y + hy * 0.38, z + 0.02, 0.009, 0.009, 0.005, "Glint", cuts=1)


# ---------------------------------------------------------------------------------------------
# Chloe

NECK = (0.0, 0.68, 0.0)
SHOULDER_R = (-0.15, 0.62, 0.0)
SHOULDER_L = (0.15, 0.62, 0.0)
TAIL_ROOT = (0.0, 0.16, -0.24)


def build_chloe(coll):
    rig = root("Chloe", coll)

    B = Part()
    # the long Victorian skirt, belled out to the floor, over a frilled white petticoat hem
    lathe(B, 0.0, 0.0, [(0, 0.03), (0.3, 0.03), (0.315, 0.07), (0.29, 0.16), (0.24, 0.29), (0.19, 0.4), (0.16, 0.46), (0, 0.47)], "Dress", segs=24)
    for k in range(22):
        a = 2 * math.pi * k / 22
        blob(B, 0.31 * math.cos(a), 0.05, 0.31 * math.sin(a), 0.05, 0.035, 0.045, "Lace", cuts=1, yaw=-a)
    # two little black shoes peeking out in front
    for sx in (-1, 1):
        blob(B, sx * 0.08, 0.035, 0.27, 0.055, 0.035, 0.07, "Shoe", cuts=2, bottom=0.0)
    # the apron over the skirt: a white panel following its slope, edged in lace, pockets
    blob(B, 0.0, 0.25, 0.235, 0.16, 0.2, 0.03, "Lace", cuts=3, tilt=-0.32)
    for k in range(9):
        t = k / 8
        x = -0.16 + 0.32 * t
        blob(B, x, 0.07 + 0.02 * math.sin(t * math.pi), 0.29, 0.026, 0.02, 0.02, "LaceShade", cuts=1)
    # the fitted bodice
    blob(B, 0.0, 0.56, 0.0, 0.165, 0.14, 0.135, "Dress", cuts=4)
    blob(B, 0.0, 0.46, 0.0, 0.17, 0.035, 0.14, "DressShade", cuts=2)  # the waist seam
    # the apron's bib, edged with a frill, its straps over the shoulders
    blob(B, 0.0, 0.55, 0.115, 0.085, 0.085, 0.03, "Lace", cuts=2)
    for k in range(7):
        t = k / 6
        a = math.pi * (0.15 + 0.7 * t)
        blob(B, -0.095 * math.cos(a), 0.55 + 0.095 * math.sin(a) - 0.02, 0.125, 0.018, 0.016, 0.014, "LaceShade", cuts=1)
    for sx in (-1, 1):
        cylinder(B, (sx * 0.075, 0.62, 0.12), (sx * 0.11, 0.69, 0.02), 0.018, "Lace", sides=6)
        cylinder(B, (sx * 0.11, 0.69, 0.02), (sx * 0.1, 0.6, -0.12), 0.018, "Lace", sides=6)
    # the apron's ties, in a bow at the small of the back
    for sx in (-1, 1):
        blob(B, sx * 0.06, 0.47, -0.155, 0.06, 0.035, 0.025, "Lace", cuts=2, yaw=sx * 0.3)
        cylinder(B, (sx * 0.02, 0.46, -0.16), (sx * 0.06, 0.34, -0.2), 0.016, "Lace", sides=6, r_end=0.012)
    blob(B, 0.0, 0.47, -0.16, 0.025, 0.025, 0.022, "Lace", cuts=1)
    # the round white collar, and the big red velvet bow at the throat
    for sx in (-1, 1):
        blob(B, sx * 0.055, 0.665, 0.085, 0.065, 0.02, 0.05, "Lace", cuts=2, yaw=sx * 0.35)
        blob(B, sx * 0.058, 0.655, 0.14, 0.055, 0.035, 0.028, "Velvet", cuts=2, yaw=-sx * 0.25)
        cylinder(B, (sx * 0.015, 0.645, 0.15), (sx * 0.04, 0.56, 0.165), 0.018, "VelvetDark", sides=6, r_end=0.012)
    blob(B, 0.0, 0.655, 0.152, 0.024, 0.026, 0.022, "VelvetDark", cuts=1)
    body = node("Chloe_Body", B, coll, rig)

    # --- the head: a calico cat, green eyes, a lace headband between her ears ---
    H = Part()
    hy = 0.86
    blob(H, 0.0, hy, 0.0, 0.225, 0.19, 0.19, "Fur", cuts=4)
    blob(H, 0.085, hy + 0.1, 0.02, 0.12, 0.08, 0.14, "Ginger", cuts=2)  # a ginger patch over her left brow
    blob(H, -0.13, hy + 0.08, -0.04, 0.09, 0.08, 0.1, "Tabby", cuts=2)  # a dark one on her right
    # the face, standing proud of the round head (its front is 0.19 out)
    blob(H, 0.0, hy - 0.065, 0.155, 0.1, 0.06, 0.065, "Lace")  # the white muzzle
    blob(H, 0.0, hy - 0.035, 0.215, 0.024, 0.017, 0.015, "Nose", cuts=1)
    eyes(H, 0.08, hy + 0.02, 0.172, 0.037, 0.045, eye="CatEye", pupil="Eye")
    for sx in (-1, 1):
        blob(H, sx * 0.14, hy - 0.05, 0.16, 0.035, 0.02, 0.012, "Blush", cuts=1)
        for dy in (0.0, 0.025):
            cylinder(H, (sx * 0.07, hy - 0.06 + dy, 0.2), (sx * 0.25, hy - 0.05 + dy * 1.5, 0.21), 0.003, "Lace", sides=4)
    # the ears: her left ginger, her right dark, pink inside
    for sx, colour in ((1, "Ginger"), (-1, "Tabby")):
        cylinder(H, (sx * 0.1, hy + 0.1, -0.01), (sx * 0.16, hy + 0.26, -0.03), 0.068, colour, sides=6, r_end=0.008)
        cylinder(H, (sx * 0.1, hy + 0.11, 0.012), (sx * 0.148, hy + 0.23, -0.004), 0.036, "EarPink", sides=5, r_end=0.006)
    # the lace headband: a black ribbon over the crown, a frill of lace standing up along it
    pts = []
    for k in range(11):
        a = math.pi * (0.2 + 0.6 * k / 10)
        pts.append((0.2 * math.cos(a), hy + 0.13 + 0.07 * math.sin(a), 0.05))
    for a, b in zip(pts, pts[1:]):
        cylinder(H, a, b, 0.012, "Dress", sides=6)
    for x, y, z in pts[1:-1]:
        blob(H, x, y + 0.025, z + 0.012, 0.03, 0.03, 0.012, "Lace", cuts=1)
        blob(H, x, y + 0.045, z + 0.01, 0.018, 0.012, 0.01, "LaceShade", cuts=1)
    node("Chloe_Head", H, coll, body, NECK)

    # --- the right arm: a puffed black sleeve, a white cuff, a cream paw (she waves with it) ---
    A = Part()
    blob(A, -0.165, 0.6, 0.0, 0.075, 0.07, 0.075, "Dress", cuts=2)
    cylinder(A, SHOULDER_R, (-0.205, 0.47, 0.05), 0.045, "Dress", r_end=0.04)
    cylinder(A, (-0.205, 0.47, 0.05), (-0.16, 0.39, 0.14), 0.042, "Dress", r_end=0.04)
    blob(A, -0.162, 0.395, 0.135, 0.048, 0.02, 0.048, "Lace", cuts=2, tilt=0.7)  # the cuff
    blob(A, -0.155, 0.37, 0.165, 0.045, 0.04, 0.05, "Fur", cuts=2)
    node("Chloe_ArmR", A, coll, body, SHOULDER_R)

    # --- the left arm, and her feather duster ---
    A = Part()
    blob(A, 0.165, 0.6, 0.0, 0.075, 0.07, 0.075, "Dress", cuts=2)
    cylinder(A, SHOULDER_L, (0.21, 0.48, 0.05), 0.045, "Dress", r_end=0.04)
    cylinder(A, (0.21, 0.48, 0.05), (0.17, 0.42, 0.15), 0.042, "Dress", r_end=0.04)
    blob(A, 0.172, 0.425, 0.145, 0.048, 0.02, 0.048, "Lace", cuts=2, tilt=0.5)
    blob(A, 0.165, 0.405, 0.17, 0.045, 0.04, 0.05, "Fur", cuts=2)
    cylinder(A, (0.16, 0.34, 0.17), (0.24, 0.8, 0.22), 0.012, "Wood", sides=6)  # the handle
    for k in range(9):
        a = 2 * math.pi * k / 9
        blob(A, 0.245 + 0.04 * math.cos(a), 0.86 + 0.02 * math.sin(a * 2), 0.225 + 0.04 * math.sin(a), 0.04, 0.07, 0.03, "Feather" if k % 2 else "FeatherLight", cuts=1, yaw=a)
    blob(A, 0.245, 0.92, 0.225, 0.04, 0.05, 0.04, "FeatherLight", cuts=1)
    node("Chloe_ArmL", A, coll, body, SHOULDER_L)

    # --- the tail: out from under the skirt at the back, curling up, a ginger tip ---
    T = Part()
    pts = [TAIL_ROOT, (0.07, 0.12, -0.38), (0.15, 0.2, -0.47), (0.2, 0.34, -0.47), (0.19, 0.46, -0.4)]
    swept(T, pts[:-1], 0.036, "Fur", r_end=0.032)
    swept(T, pts[-2:], 0.032, "Ginger", r_end=0.026)
    node("Chloe_Tail", T, coll, body, TAIL_ROOT)
    return rig


# ---------------------------------------------------------------------------------------------
# the cheval mirror: an oval glass (0.56 by 1.0) between two turned uprights, facing +z


MIRROR_AT = (0.95, 0.0, 0.55)  # where it stands in the file (beside Chloe, for previews); the game places it
OVAL = (0.0, 0.98, 0.0, 0.29, 0.51)  # centre (x, y, z), half-width, half-height


def build_mirror(coll):
    rig = root("Mirror", coll, MIRROR_AT)
    ox, oy, oz, hw, hh = OVAL
    F = Part()
    for sx in (-1, 1):
        x = sx * (hw + 0.1)
        # a turned upright: a slender post with gilded collars, and a finial on top
        cylinder(F, (x, 0.07, oz), (x, 1.36, oz), 0.028, "Gilt", sides=10, r_end=0.022)
        for y in (0.12, 0.45, 0.62, 1.28):
            blob(F, x, y, oz, 0.036, 0.022, 0.036, "GiltDark", cuts=2)
        blob(F, x, 1.4, oz, 0.04, 0.04, 0.04, "Gilt", cuts=2)
        cylinder(F, (x, 1.42, oz), (x, 1.5, oz), 0.012, "Gilt", sides=6, r_end=0.002)
        # a scrolled foot along z, curling up at both ends
        cylinder(F, (x, 0.05, oz - 0.22), (x, 0.05, oz + 0.22), 0.032, "Gilt", sides=8)
        for sz in (-1, 1):
            blob(F, x, 0.07, oz + sz * 0.24, 0.036, 0.045, 0.035, "GiltDark", cuts=2)
        # the pivot pin into the frame
        cylinder(F, (x, oy, oz), (sx * (hw + 0.02), oy, oz), 0.018, "GiltDark", sides=8)
    cylinder(F, (-(hw + 0.1), 0.3, oz), (hw + 0.1, 0.3, oz), 0.018, "Gilt", sides=8)  # the stretcher
    # the oval frame: a gilded moulding round the glass, beaded, with a shell crest on top
    ring = []
    for k in range(40):
        a = 2 * math.pi * k / 40
        ring.append((ox + (hw + 0.035) * math.cos(a), oy + (hh + 0.035) * math.sin(a), oz + 0.01))
    for a, b in zip(ring, ring[1:] + ring[:1]):
        cylinder(F, a, b, 0.032, "Gilt", sides=8)
        blob(F, b[0], b[1], b[2], 0.032, 0.032, 0.032, "Gilt", cuts=1)
    for k in range(0, 40, 2):
        a = 2 * math.pi * k / 40
        blob(F, ox + (hw + 0.035) * math.cos(a), oy + (hh + 0.035) * math.sin(a), oz + 0.04, 0.012, 0.012, 0.01, "GiltDark", cuts=1)
    for k in range(5):  # the shell crest: a fan of ribs over the top
        a = math.pi * (0.25 + 0.5 * k / 4)
        cylinder(F, (ox, oy + hh + 0.05, oz + 0.02), (ox + 0.13 * math.cos(a), oy + hh + 0.05 + 0.12 * math.sin(a), oz + 0.02), 0.022, "Gilt", sides=6, r_end=0.012)
    blob(F, ox, oy + hh + 0.06, oz + 0.03, 0.04, 0.035, 0.03, "GiltDark", cuts=2)
    for sx in (-1, 1):  # little scrolls at its sides
        blob(F, ox + sx * 0.12, oy + hh + 0.04, oz + 0.02, 0.035, 0.03, 0.025, "Gilt", cuts=2)
    blob(F, ox, oy - hh - 0.06, oz + 0.02, 0.05, 0.03, 0.025, "Gilt", cuts=2)  # a bead at the bottom
    blob(F, ox, oy, oz - 0.02, hw + 0.01, hh + 0.01, 0.018, "Backing", cuts=3, n=2.0)  # the backing
    # (built round the mirror's own feet: moved out to where it stands, each node's origin there)
    for v in F.bm.verts:
        v.co += W(*MIRROR_AT)
    node("Mirror_Frame", F, coll, rig, MIRROR_AT)

    G = Part()
    blob(G, ox, oy, oz + 0.004, hw, hh, 0.008, "Glass", cuts=4, n=2.0)
    for v in G.bm.verts:
        v.co += W(*MIRROR_AT)
    node("Mirror_Glass", G, coll, rig, MIRROR_AT, material=clay(GLASS_MATERIAL, roughness=0.15, metallic=0.6))
    return rig


# ---------------------------------------------------------------------------------------------
# export


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
        if o.data is None:
            continue
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials)}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root_dir = repo_root()
        studio(root_dir, "begin")
        purge(COLLECTION)
        coll = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(coll)
        build_chloe(coll)
        build_mirror(coll)
        bpy.context.view_layer.update()
        out = os.path.join(root_dir, "client", "public", "models", "chloe_maid.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
        result["studio"] = studio(root_dir, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
