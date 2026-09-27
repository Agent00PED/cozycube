"""Bramble the Bear, the Whispering Woods' ranger and trader: builds client/public/models/bramble.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_bramble.py

A big, soft chibi brown bear in a forest-green ranger's shirt with rolled sleeves, tan trousers held
up by braces, a red neckerchief, a flat-brimmed ranger's hat with a pine-cone badge on its band, and
a pencil behind his ear. He stands behind his store counter in the woods (FOREST_LAYOUT.counter,
0.7 in front of him), leaning on it, both paws on its top. Built the way the casino's staff are
(scripts/blender/build_casino_staff.py): every colour a vertex colour and each node ONE matte clay
material, one draw call per node. He stands at his own origin facing +z; the game places and turns
him (FOREST_LAYOUT.bramble). The nodes entities/CampNpc.tsx animates:

    Bramble             the root (an empty at his feet)
      Bramble_Body      legs, feet, the round body, shirt, braces, neckerchief
        Bramble_Head    head, muzzle, nose, eyes, ears, hat and pencil (pivots at the neck)
        Bramble_ArmR    his right arm, its paw on the counter (pivots at the shoulder: he waves)
        Bramble_ArmL    his left arm, its paw on the counter (pivots at the shoulder)
        Bramble_Tail    his stubby tail (pivots where it joins)

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

COLLECTION = "Bramble"
MATERIAL = "BR_Clay"

PALETTE = {
    "Fur": "#7A5236",
    "FurDark": "#5A3A25",
    "Muzzle": "#D9B48A",
    "Nose": "#2A1F1B",
    "Eye": "#1B1818",
    "Glint": "#FFFFFF",
    "Blush": "#E0937F",
    "Shirt": "#4F6B45",
    "ShirtDark": "#3F5838",
    "Trousers": "#B79A6E",
    "Braces": "#6B3B2A",
    "Brass": "#D4A548",
    "Kerchief": "#C2463A",
    "Hat": "#A8865A",
    "HatBand": "#5A3A25",
    "Cone": "#8A5A34",
    "Boot": "#3D2A1F",
    "Pencil": "#F2C14E",
    "PencilTip": "#2B2622",
    "Patch": "#E9DDC4",
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
    if "__file__" in globals() and __file__.endswith("build_bramble.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "forest.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


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


def slab(P, outline, y0, y1, c):
    bm, m = P.bm, P.c(c)
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = m
    bm.faces.new(hi).material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m


def box(P, x0, x1, y0, y1, z0, z1, c):
    slab(P, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, c)


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


def lathe(P, cx, cz, profile, c, segs=16, y0=0.0):
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


def blob(P, cx, cy, cz, hx, hy, hz, c, cuts=3, n=2.2, top=None, bottom=None, tilt=0.0):
    bm, m = P.bm, P.c(c)
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    cs, sn = math.cos(tilt), math.sin(tilt)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        x, y, z = q.x * hx, q.z * hy, -q.y * hz
        y, z = y * cs - z * sn, y * sn + z * cs
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


# ---------------------------------------------------------------------------------------------
# Blender plumbing: one vertex-coloured clay material for every node


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
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.82
    m.use_backface_culling = True
    return m


def node(name, P, coll, parent=None, pivot=(0.0, 0.0, 0.0)):
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
    me.materials.append(clay())
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


def eyes(P, x, y, z, hx, hy):
    for sx in (-1, 1):
        blob(P, sx * x, y, z, hx, hy, 0.02, "Eye", cuts=2)
        blob(P, sx * x - 0.008, y + hy * 0.35, z + 0.018, 0.009, 0.009, 0.005, "Glint", cuts=1)


# ---------------------------------------------------------------------------------------------
# Bramble


def build(root):
    L = read_layout(root)
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rig = bpy.data.objects.new("Bramble", None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]
    counter = L["counter"]
    ahead = abs(counter["z"] - L["bramble"]["z"]) - counter["w"] / 2  # the counter's near edge
    top = counter["top"] + 0.03

    # --- the body: boots, legs in tan trousers, the big round middle in the ranger's shirt ---
    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.15, 0.17, 0.0, 0.12, 0.17, 0.12, "Trousers")
        blob(B, sx * 0.16, 0.05, 0.07, 0.11, 0.055, 0.15, "Boot", bottom=0.0)
        blob(B, sx * 0.16, 0.1, 0.02, 0.115, 0.03, 0.115, "Boot")  # the boot's cuff
    blob(B, 0.0, 0.58, 0.0, 0.32, 0.33, 0.285, "Fur", cuts=4)
    blob(B, 0.0, 0.36, 0.0, 0.345, 0.14, 0.305, "Trousers", top=0.44)
    blob(B, 0.0, 0.58, -0.005, 0.36, 0.34, 0.325, "Shirt", cuts=4, top=0.84, bottom=0.4)
    # the ranger's patch on his chest: a cream roundel with a green pine
    blob(B, 0.15, 0.66, 0.31, 0.045, 0.045, 0.012, "Patch", cuts=2)
    blob(B, 0.15, 0.66, 0.322, 0.022, 0.03, 0.006, "Shirt", cuts=1)
    # the braces, over the shoulders; brass clips at the waistband
    for sx in (-1, 1):
        cylinder(B, (sx * 0.14, 0.45, 0.29), (sx * 0.17, 0.84, 0.16), 0.022, "Braces", sides=6)
        cylinder(B, (sx * 0.17, 0.84, 0.16), (sx * 0.16, 0.8, -0.2), 0.022, "Braces", sides=6)
        cylinder(B, (sx * 0.16, 0.8, -0.2), (sx * 0.12, 0.45, -0.3), 0.022, "Braces", sides=6)
        blob(B, sx * 0.14, 0.455, 0.3, 0.026, 0.02, 0.012, "Brass", cuts=1)
    # the red neckerchief, knotted at the front
    blob(B, 0.0, 0.87, 0.03, 0.22, 0.05, 0.2, "Kerchief", cuts=3)
    blob(B, 0.0, 0.8, 0.22, 0.06, 0.07, 0.035, "Kerchief", cuts=2)
    blob(B, 0.0, 0.855, 0.225, 0.035, 0.03, 0.03, "Kerchief", cuts=2)
    body = node("Bramble_Body", B, coll, rig)

    # --- the head: big and round, a cream muzzle, the ranger's hat ---
    H = Part()
    neck = (0.0, 0.9, 0.0)
    blob(H, 0.0, 1.14, 0.0, 0.3, 0.27, 0.27, "Fur", cuts=4)
    blob(H, 0.0, 1.06, 0.2, 0.15, 0.1, 0.12, "Muzzle")
    blob(H, 0.0, 1.11, 0.315, 0.055, 0.04, 0.034, "Nose", cuts=2)
    blob(H, 0.0, 1.04, 0.3, 0.035, 0.012, 0.012, "FurDark", cuts=1)  # the mouth line
    eyes(H, 0.11, 1.18, 0.235, 0.028, 0.034)
    for sx in (-1, 1):
        blob(H, sx * 0.21, 1.33, -0.02, 0.085, 0.075, 0.05, "Fur")  # an ear, poking out under the brim
        blob(H, sx * 0.21, 1.33, 0.01, 0.045, 0.04, 0.02, "Muzzle", cuts=2)
        blob(H, sx * 0.19, 1.08, 0.2, 0.038, 0.022, 0.015, "Blush", cuts=1)
        blob(H, sx * 0.1, 1.24, 0.25, 0.04, 0.012, 0.012, "FurDark", cuts=1)  # a bushy brow
    # the flat-brimmed ranger's hat: a wide brim, a pinched crown, a band with a pine-cone badge
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.4, 0.0), (0.41, 0.02), (0.395, 0.03), (0, 0.03)], "Hat", segs=24, y0=1.34)
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.2, 0.0), (0.19, 0.12), (0.12, 0.2), (0, 0.2)], "Hat", segs=20, y0=1.36)
    for sx in (-1, 1):  # the crown's four pinches (dents)
        blob(H, sx * 0.1, 1.53, -0.01, 0.04, 0.03, 0.08, "HatBand", cuts=1)
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.205, 0.0), (0.2, 0.045), (0, 0.045)], "HatBand", segs=20, y0=1.37)
    blob(H, 0.0, 1.395, 0.205, 0.028, 0.036, 0.018, "Cone", cuts=2)
    # the pencil behind his right ear
    cylinder(H, (-0.24, 1.26, 0.1), (-0.26, 1.3, -0.12), 0.012, "Pencil", sides=6)
    cylinder(H, (-0.24, 1.26, 0.1), (-0.237, 1.255, 0.13), 0.012, "PencilTip", sides=6, r_end=0.002)
    node("Bramble_Head", H, coll, body, neck)

    # --- the arms: rolled sleeves, furry forearms, both paws on the counter ---
    for sx, name in ((-1, "Bramble_ArmR"), (1, "Bramble_ArmL")):
        A = Part()
        shoulder = (sx * 0.33, 0.78, 0.02)
        elbow = (sx * 0.43, 0.58, 0.2)
        paw = (sx * 0.24, top + 0.03, ahead + 0.1)
        cylinder(A, shoulder, elbow, 0.085, "Shirt", r_end=0.08)
        blob(A, elbow[0], elbow[1], elbow[2], 0.088, 0.06, 0.088, "ShirtDark", cuts=2)  # the rolled cuff
        cylinder(A, elbow, paw, 0.072, "Fur", r_end=0.066)
        blob(A, paw[0], paw[1], paw[2], 0.08, 0.055, 0.09, "Fur", cuts=2)
        for k in range(3):  # the pads of his fingers
            blob(A, paw[0] + (k - 1) * 0.04, paw[1] - 0.005, paw[2] + 0.075, 0.02, 0.018, 0.015, "FurDark", cuts=1)
        node(name, A, coll, body, shoulder)

    # --- the stubby tail ---
    T = Part()
    blob(T, 0.0, 0.4, -0.33, 0.08, 0.07, 0.06, "FurDark")
    node("Bramble_Tail", T, coll, body, (0.0, 0.4, -0.29))
    return coll


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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "y": [round(lo[2], 3), round(hi[2], 3)], "materials": len(o.data.materials)}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll = build(root)
        bpy.context.view_layer.update()
        out = os.path.join(root, "client", "public", "models", "bramble.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
