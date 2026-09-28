"""Finley the River Otter, the Whispering Woods' angler: builds client/public/models/finley.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_finley.py

A small, sleek chibi river otter in an olive fishing vest full of pockets, a tan bucket hat with
bright flies hooked in its band, sitting on a smooth riverside boulder with his bamboo rod held out
over the water (the line down to a red and white float), a green tackle box with a brass latch and a
bait tin at his side. He sits at his own origin facing +z (the water); the game places and turns him
(FOREST_LAYOUT.finley). Built the way Bramble is (build_bramble.py): every colour a vertex colour
and each node ONE matte clay material, one draw call per node. The nodes entities/CampNpc.tsx
animates:

    Finley              the root (an empty at the boulder's foot)
      Finley_Rock       the boulder, the tackle box and the bait tin (still: they never breathe)
      Finley_Body       his seated body, legs, vest (pivots on the boulder's top)
        Finley_Head     head, muzzle, whiskers, eyes, ears, the bucket hat (pivots at the neck)
        Finley_ArmR     his right arm (pivots at the shoulder: he waves)
        Finley_ArmL     his left arm holding the rod, the line and the float
        Finley_Tail     his long tail, curled round the boulder (pivots where it joins)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); W converts.
"""

import json
import math
import os
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Finley"
MATERIAL = "FN_Clay"

PALETTE = {
    "Fur": "#8A5A34",
    "FurDark": "#6A4226",
    "Belly": "#E6CFA6",
    "Nose": "#2A1F1B",
    "Eye": "#1B1818",
    "Glint": "#FFFFFF",
    "Blush": "#E0937F",
    "Whisker": "#F4EBDD",
    "Vest": "#6E7C47",
    "VestDark": "#56623A",
    "Pocket": "#7E8C55",
    "Hat": "#C9A66B",
    "HatBand": "#7A5236",
    "FlyRed": "#D9483B",
    "FlyBlue": "#4E8FD1",
    "FlyGold": "#F2C14E",
    "Rod": "#D9B36A",
    "RodWrap": "#6B3B2A",
    "Reel": "#B8B8B8",
    "Line": "#F4F1EA",
    "FloatRed": "#D9483B",
    "FloatWhite": "#F7F2E8",
    "Rock": "#8C9096",
    "RockDark": "#6E7277",
    "Moss": "#5E8A48",
    "Box": "#3F7A55",
    "BoxDark": "#2F5E41",
    "Brass": "#D4A548",
    "Tin": "#B9C2C8",
    "Worm": "#D98A8A",
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
    if "__file__" in globals() and __file__.endswith("build_finley.py"):
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
# Finley


def build(root):
    L = read_layout(root)
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rig = bpy.data.objects.new("Finley", None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]
    top = 0.46  # the boulder's worn, flat top: he sits on it
    water = L["river"]["water"]

    # --- the boulder, and beside him the tackle box and a bait tin (they never breathe) ---
    R = Part()
    blob(R, 0.0, top / 2 - 0.03, -0.05, 0.46, top / 2 + 0.03, 0.4, "Rock", cuts=4, n=2.6, top=top, bottom=-0.04)
    blob(R, 0.18, top - 0.02, 0.12, 0.2, 0.04, 0.16, "RockDark", cuts=2, top=top + 0.01)
    blob(R, -0.25, 0.1, -0.3, 0.26, 0.13, 0.22, "RockDark", cuts=3, bottom=-0.02)
    blob(R, -0.12, top - 0.01, -0.2, 0.22, 0.035, 0.14, "Moss", cuts=2, top=top + 0.025)
    # the tackle box on the ground at his left: green, a brass latch and handle
    bx, bz = 0.56, -0.12
    box(R, bx - 0.17, bx + 0.17, 0.0, 0.17, bz - 0.11, bz + 0.11, "Box")
    box(R, bx - 0.175, bx + 0.175, 0.17, 0.2, bz - 0.115, bz + 0.115, "BoxDark")
    box(R, bx - 0.025, bx + 0.025, 0.12, 0.18, bz + 0.105, bz + 0.12, "Brass")
    cylinder(R, (bx - 0.07, 0.2, bz), (bx - 0.07, 0.25, bz), 0.012, "Brass", sides=6)
    cylinder(R, (bx + 0.07, 0.2, bz), (bx + 0.07, 0.25, bz), 0.012, "Brass", sides=6)
    cylinder(R, (bx - 0.07, 0.25, bz), (bx + 0.07, 0.25, bz), 0.012, "Brass", sides=6)
    # the bait tin, lid off, a worm peeking out
    lathe(R, -0.52, 0.18, [(0, 0.0), (0.075, 0.0), (0.075, 0.07), (0, 0.07)], "Tin", segs=14)
    cylinder(R, (-0.52, 0.07, 0.18), (-0.49, 0.12, 0.2), 0.012, "Worm", sides=6)
    node("Finley_Rock", R, coll, rig)

    # --- the body: seated on the boulder, legs forward over its front edge, the fishing vest ---
    B = Part()
    seat = (0.0, top, 0.0)
    blob(B, 0.0, top + 0.2, 0.0, 0.2, 0.24, 0.18, "Fur", cuts=4)
    blob(B, 0.0, top + 0.18, 0.1, 0.13, 0.18, 0.1, "Belly", cuts=3)
    blob(B, 0.0, top + 0.24, -0.005, 0.215, 0.2, 0.19, "Vest", cuts=3, top=top + 0.42, bottom=top + 0.08)
    blob(B, 0.0, top + 0.25, 0.14, 0.095, 0.15, 0.085, "Belly", cuts=3)  # the vest open over his belly
    for sx in (-1, 1):
        blob(B, sx * 0.12, top + 0.16, 0.17, 0.05, 0.045, 0.02, "Pocket", cuts=1)
        blob(B, sx * 0.13, top + 0.3, 0.16, 0.04, 0.035, 0.02, "Pocket", cuts=1)
        # the legs, forward over the boulder's edge, and his webbed feet
        cylinder(B, (sx * 0.09, top + 0.06, 0.08), (sx * 0.1, top - 0.02, 0.3), 0.065, "Fur", r_end=0.055)
        blob(B, sx * 0.1, top - 0.05, 0.34, 0.06, 0.035, 0.07, "FurDark", cuts=2)
    body = node("Finley_Body", B, coll, rig, seat)

    # --- the head: round, a pale muzzle, whiskers, little ears, the bucket hat with flies ---
    H = Part()
    neck = (0.0, top + 0.43, 0.0)
    blob(H, 0.0, top + 0.6, 0.0, 0.19, 0.17, 0.17, "Fur", cuts=4)
    blob(H, 0.0, top + 0.54, 0.12, 0.11, 0.075, 0.08, "Belly", cuts=3)
    blob(H, 0.0, top + 0.58, 0.2, 0.04, 0.03, 0.025, "Nose", cuts=2)
    eyes(H, 0.075, top + 0.63, 0.15, 0.022, 0.026)
    for sx in (-1, 1):
        blob(H, sx * 0.15, top + 0.72, -0.02, 0.04, 0.035, 0.025, "FurDark", cuts=2)  # a little ear
        blob(H, sx * 0.12, top + 0.55, 0.14, 0.028, 0.016, 0.012, "Blush", cuts=1)
        for k in (-1, 1):  # two whiskers a side
            cylinder(H, (sx * 0.08, top + 0.56 + k * 0.012, 0.18), (sx * 0.23, top + 0.57 + k * 0.03, 0.15), 0.004, "Whisker", sides=4)
    # the bucket hat: a soft brim, a round crown, a band with three bright flies
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.27, 0.0), (0.28, -0.035), (0.25, 0.012), (0, 0.012)], "Hat", segs=22, y0=top + 0.73)
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.175, 0.0), (0.165, 0.1), (0.12, 0.15), (0, 0.155)], "Hat", segs=20, y0=top + 0.74)
    lathe(H, 0.0, -0.01, [(0, 0.0), (0.178, 0.0), (0.172, 0.035), (0, 0.035)], "HatBand", segs=20, y0=top + 0.745)
    for ang, c in ((0.5, "FlyRed"), (1.3, "FlyBlue"), (2.2, "FlyGold")):
        fx, fz = math.cos(ang) * 0.178, math.sin(ang) * 0.178 - 0.01
        blob(H, fx, top + 0.765, fz, 0.022, 0.014, 0.022, c, cuts=1)
    node("Finley_Head", H, coll, body, neck)

    # --- the right arm: resting on his knee (he waves with it) ---
    A = Part()
    shoulder = (-0.19, top + 0.33, 0.02)
    paw = (-0.13, top + 0.12, 0.2)
    cylinder(A, shoulder, paw, 0.05, "Fur", r_end=0.045)
    blob(A, paw[0], paw[1], paw[2], 0.05, 0.04, 0.05, "FurDark", cuts=2)
    node("Finley_ArmR", A, coll, body, shoulder)

    # --- the left arm: holding the rod out over the water, the line down to the float ---
    A = Part()
    shoulder = (0.19, top + 0.33, 0.02)
    grip = (0.2, top + 0.2, 0.24)
    cylinder(A, shoulder, grip, 0.05, "Fur", r_end=0.045)
    blob(A, grip[0], grip[1], grip[2], 0.05, 0.045, 0.05, "FurDark", cuts=2)
    butt = (0.21, top + 0.08, 0.08)
    tip = (0.34, top + 0.95, 1.25)
    cylinder(A, butt, tip, 0.018, "Rod", sides=7, r_end=0.006)
    cylinder(A, butt, (0.213, top + 0.2, 0.22), 0.024, "RodWrap", sides=7)
    lathe(A, 0.24, 0.2, [(0, 0.0), (0.035, 0.0), (0.035, 0.03), (0, 0.03)], "Reel", segs=10, y0=top + 0.13)
    bob = (0.36, water + 0.02, 2.0)
    cylinder(A, tip, (bob[0], bob[1] + 0.07, bob[2]), 0.0035, "Line", sides=4)
    blob(A, bob[0], bob[1] + 0.035, bob[2], 0.035, 0.03, 0.035, "FloatRed", cuts=2)
    blob(A, bob[0], bob[1] + 0.065, bob[2], 0.028, 0.02, 0.028, "FloatWhite", cuts=2)
    node("Finley_ArmL", A, coll, body, shoulder)

    # --- the long tail, curled round the boulder's side ---
    T = Part()
    root_t = (0.0, top + 0.06, -0.16)
    pts = [root_t, (-0.12, top - 0.02, -0.34), (-0.34, top - 0.12, -0.36), (-0.46, top - 0.22, -0.2)]
    for a, b in zip(pts, pts[1:]):
        cylinder(T, a, b, 0.055, "Fur", r_end=0.045)
    blob(T, pts[-1][0], pts[-1][1], pts[-1][2], 0.045, 0.04, 0.045, "FurDark", cuts=2)
    node("Finley_Tail", T, coll, body, root_t)
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
        out = os.path.join(root, "client", "public", "models", "finley.glb")
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
