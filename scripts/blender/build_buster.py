"""Buster the Lumberjack, the Campfire's woodpile beaver: builds client/public/models/buster.glb.

Run it inside Blender, through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_buster.py

or headless:

    blender -b -P scripts/blender/build_buster.py

As with the other builders, define REPO_ROOT (and optionally REPORT_PATH, where a JSON summary or
the traceback is written) in front of the body when it is POSTed without a `__file__`.

A stout chibi beaver in a red buffalo-plaid shirt, jeans and a striped knit beanie, big front
teeth and a flat paddle tail, leaning on his axe beside his stall (a sawhorse stacked with split
logs and a FIREWOOD board). Stylised clay, every material opaque and matte. The model stands at
its own origin, feet on the ground, facing +z; the game places and turns it
(CAMPFIRE_LAYOUT.buster). Nodes:

    Buster              the root (an empty at his feet)
      Buster_Body       legs, boots, the round body, the plaid shirt, jeans and belt
        Buster_Head     head, muzzle, teeth, nose, eyes, ears, whiskers and beanie (pivots at the neck)
        Buster_ArmR     his right arm (pivots at the shoulder: he waves)
        Buster_ArmL     his left arm, its paw on the handle of the axe standing beside him
        Buster_Tail     his flat paddle tail (pivots where it joins: it sways)
      Buster_Stall      the sawhorse, its stacked logs and the FIREWOOD board

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION = "Buster"

PALETTE = {
    "BU_Fur": "#7A4E2D",
    "BU_FurDark": "#4A3222",
    "BU_Cream": "#E8CFA6",
    "BU_Nose": "#2B211D",
    "BU_Tooth": "#FBF4E4",
    "BU_Glint": "#FFFFFF",
    "BU_Blush": "#E89A8C",
    "BU_Plaid": "#B3403A",
    "BU_PlaidDark": "#2A2226",
    "BU_Jeans": "#3F5F8A",
    "BU_Belt": "#5A3A26",
    "BU_Boot": "#6B4A32",
    "BU_Beanie": "#C8553D",
    "BU_BeanieStripe": "#F2E6CF",
    "BU_Handle": "#C9A273",
    "BU_Steel": "#A7AEB5",
    "BU_Wood": "#9C7148",
    "BU_WoodDark": "#7C5838",
    "BU_WoodCut": "#E0B886",
    "BU_Board": "#2F3A33",
    "BU_Chalk": "#F2EEE2",
}
ROUGHNESS = {"BU_Nose": 0.5, "BU_Steel": 0.45, "BU_Tooth": 0.55}


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
    if "__file__" in globals() and __file__.endswith("build_buster.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# ---------------------------------------------------------------------------------------------
# shapes


def slab(bm, outline, y0, y1, m=0):
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = m
    bm.faces.new(hi).material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m


def box(bm, x0, x1, y0, y1, z0, z1, m=0):
    slab(bm, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, m)


def cylinder(bm, a, b, r, sides=10, m=0, r_end=None):
    """A round bar from game point a to game point b, radius r (tapering to r_end), capped."""
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


def lathe(bm, cx, cz, profile, segs=16, m=0, y0=0.0):
    """A solid of revolution about the vertical through (cx, cz): (radius, height) points from the
    bottom centre (r = 0) to the top centre (r = 0)."""
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


def blob(bm, cx, cy, cz, hx, hy, hz, m=0, cuts=4, n=2.2, top=None, bottom=None, tilt=0.0):
    """A rounded lump (a superellipsoid) centred at the game point (cx, cy, cz), optionally cut flat
    at the heights `top` / `bottom` and leaned forward by `tilt` (radians, about x)."""
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    c, s = math.cos(tilt), math.sin(tilt)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        x, y, z = q.x * hx, q.z * hy, -q.y * hz
        y, z = y * c - z * s, y * s + z * c
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
# Blender plumbing


def purge():
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
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
    m.diffuse_color = (*c, 1)
    m.roughness = rough
    m.use_backface_culling = True
    return m


def make_object(name, bm, mats, coll, parent=None, pivot=(0.0, 0.0, 0.0)):
    """`bm` as a mesh object `name` with its origin at the game point `pivot`, under `parent`."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    shift = W(*pivot)
    for v in bm.verts:
        v.co -= shift
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(material(m))
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    place(ob, parent, pivot)
    return ob


def place(ob, parent, pivot):
    """Stand `ob` at the model's point `pivot`, as a child of `parent` (whose own origin is at its
    model point `parent["pivot"]`)."""
    ob["pivot"] = list(pivot)
    if parent is None:
        ob.location = W(*pivot)
        return
    ob.parent = parent
    pp = parent["pivot"]
    ob.location = W(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2])


def lettering(coll, text, at, size, mat_name):
    """`text` as a mesh, standing upright at the game point `at`, reading toward +z."""
    curve = bpy.data.curves.new(f"Text_{text}", "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.002
    curve.resolution_u = 2
    ob = bpy.data.objects.new(f"Text_{text}", curve)
    coll.objects.link(ob)
    n = Vector((0, -1, 0))  # +z in the game, in Blender's axes
    up = Vector((0, 0, 1))
    right = up.cross(n)
    ob.matrix_world = Matrix.Translation(W(*at)) @ Matrix((right, up, n)).transposed().to_4x4()
    bpy.context.view_layer.update()
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.convert(target="MESH")
    ob.data.materials.clear()
    ob.data.materials.append(material(mat_name))
    return ob


# ---------------------------------------------------------------------------------------------
# Buster

NECK = (0.0, 0.64, 0.0)
SHOULDER_R = (-0.25, 0.54, 0.02)
SHOULDER_L = (0.25, 0.54, 0.02)
TAIL_ROOT = (0.0, 0.16, -0.22)
STALL = (-0.7, 0.0, 0.05)


def plaid_rings(bm, cy, hy, hx, hz, m, rows):
    """Dark plaid bands round a body blob of half-sizes hx, hz at heights cy + dy (a buffalo check,
    with the vertical bars built beside it)."""
    for dy in rows:
        k = math.sqrt(max(0.05, 1 - (dy / hy) ** 2))
        blob(bm, 0.0, cy + dy, 0.0, hx * k + 0.012, 0.022, hz * k + 0.012, m=m, cuts=4)


def build(root):
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rig = bpy.data.objects.new("Buster", None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]

    # --- the body: boots, jeans, the plaid shirt with its checks, a belt ---
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, sx * 0.13, 0.13, 0.0, 0.1, 0.11, 0.1, m=4)  # a jeans leg
        blob(bm, sx * 0.14, 0.045, 0.06, 0.095, 0.045, 0.13, m=6, bottom=0.0)  # a work boot
        blob(bm, sx * 0.14, 0.09, 0.03, 0.1, 0.02, 0.1, m=6)  # its cuff
    blob(bm, 0.0, 0.3, 0.0, 0.29, 0.14, 0.26, m=4, cuts=5, top=0.36, bottom=0.14)  # the jeans' seat
    blob(bm, 0.0, 0.46, 0.0, 0.285, 0.23, 0.255, m=1, cuts=5, bottom=0.3)  # the shirt
    plaid_rings(bm, 0.46, 0.23, 0.285, 0.255, 2, (-0.1, 0.0, 0.1))
    for k in range(8):  # the check's vertical bars
        a = 2 * math.pi * k / 8
        x, z = math.sin(a) * 0.29, math.cos(a) * 0.26
        cylinder(bm, (x * 0.97, 0.31, z * 0.97), (x * 0.78, 0.62, z * 0.78), 0.02, 6, m=2)
    blob(bm, 0.0, 0.62, 0.15, 0.12, 0.06, 0.08, m=3)  # the cream chest at the open collar
    blob(bm, 0.0, 0.345, 0.0, 0.3, 0.025, 0.27, m=5)  # the belt
    box(bm, -0.04, 0.04, 0.325, 0.365, 0.262, 0.28, m=7)  # its buckle
    body = make_object("Buster_Body", bm, ["BU_Fur", "BU_Plaid", "BU_PlaidDark", "BU_Cream", "BU_Jeans", "BU_Belt", "BU_Boot", "BU_Steel"], coll, rig, (0.0, 0.0, 0.0))

    # --- the head (pivots at the neck) ---
    bm = bmesh.new()
    blob(bm, 0.0, 0.82, 0.01, 0.245, 0.215, 0.225, m=0, cuts=5)
    blob(bm, 0.0, 0.75, 0.165, 0.15, 0.09, 0.105, m=1)  # the muzzle
    blob(bm, 0.0, 0.8, 0.265, 0.05, 0.035, 0.034, m=2, cuts=3)  # the nose
    for sx in (-1, 1):
        box(bm, sx * 0.03 - 0.026, sx * 0.03 + 0.026, 0.64, 0.7, 0.228, 0.248, m=3)  # a big front tooth
        blob(bm, sx * 0.1, 0.865, 0.19, 0.03, 0.038, 0.022, m=2, cuts=3)  # an eye
        blob(bm, sx * 0.092, 0.88, 0.208, 0.009, 0.009, 0.006, m=4, cuts=1)  # its glint
        blob(bm, sx * 0.165, 0.77, 0.15, 0.04, 0.025, 0.02, m=5, cuts=2)  # a blush
        blob(bm, sx * 0.2, 0.97, -0.03, 0.055, 0.045, 0.03, m=0)  # an ear
        for dy in (0.0, 0.03):  # whiskers
            cylinder(bm, (sx * 0.11, 0.745 + dy, 0.24), (sx * 0.29, 0.735 + dy * 1.6, 0.255), 0.004, 4, m=2)
    # the striped knit beanie, turned up at the brim, a pom on top
    lathe(bm, 0.0, -0.01, [(0, 0.0), (0.235, 0.0), (0.24, 0.06), (0.21, 0.13), (0.14, 0.19), (0, 0.21)], segs=20, m=6, y0=0.93)
    for y0, r in ((0.99, 0.241), (1.05, 0.222)):
        lathe(bm, 0.0, -0.01, [(0, 0.0), (r, 0.0), (r, 0.022), (0, 0.022)], segs=20, m=7, y0=y0)
    lathe(bm, 0.0, -0.01, [(0, 0.0), (0.25, 0.0), (0.254, 0.05), (0, 0.05)], segs=20, m=6, y0=0.915)
    blob(bm, 0.0, 1.16, -0.01, 0.06, 0.06, 0.06, m=7)
    make_object("Buster_Head", bm, ["BU_Fur", "BU_Cream", "BU_Nose", "BU_Tooth", "BU_Glint", "BU_Blush", "BU_Beanie", "BU_BeanieStripe"], coll, body, NECK)

    # --- the right arm (he waves with it), a plaid sleeve and a paw ---
    bm = bmesh.new()
    cylinder(bm, SHOULDER_R, (-0.31, 0.34, 0.07), 0.064, 10, m=0, r_end=0.056)
    blob(bm, -0.312, 0.32, 0.08, 0.058, 0.055, 0.058, m=1)
    make_object("Buster_ArmR", bm, ["BU_Plaid", "BU_Fur"], coll, body, SHOULDER_R)

    # --- the left arm, its paw on the top of the handle of the axe standing head down beside him ---
    bm = bmesh.new()
    cylinder(bm, SHOULDER_L, (0.33, 0.4, 0.12), 0.064, 10, m=0, r_end=0.056)
    blob(bm, 0.335, 0.38, 0.13, 0.058, 0.055, 0.058, m=1)
    cylinder(bm, (0.36, 0.43, 0.14), (0.42, 0.07, 0.2), 0.018, 8, m=2)
    box(bm, 0.4, 0.44, 0.0, 0.12, 0.1, 0.24, m=3)  # the blade, bitten into the ground
    make_object("Buster_ArmL", bm, ["BU_Plaid", "BU_Fur", "BU_Handle", "BU_Steel"], coll, body, SHOULDER_L)

    # --- the paddle tail, flat and wide, lying out behind him ---
    bm = bmesh.new()
    cylinder(bm, TAIL_ROOT, (0.0, 0.05, -0.36), 0.07, 10, m=0, r_end=0.06)
    blob(bm, 0.0, 0.035, -0.55, 0.14, 0.025, 0.2, m=0, n=3.0)
    make_object("Buster_Tail", bm, ["BU_FurDark"], coll, body, TAIL_ROOT)

    # --- the stall: a sawhorse stacked with split logs, and the FIREWOOD board ---
    sx, _, sz = STALL
    bm = bmesh.new()
    for dx in (-0.32, 0.32):  # the sawhorse's X legs
        for s in (-1, 1):
            cylinder(bm, (sx + dx, 0.0, sz + s * 0.2), (sx + dx, 0.42, sz - s * 0.05), 0.022, 6, m=0)
    cylinder(bm, (sx - 0.4, 0.4, sz - 0.02), (sx + 0.4, 0.4, sz - 0.02), 0.03, 6, m=0)
    for k, (dz, y) in enumerate(((-0.12, 0.47), (0.0, 0.47), (0.12, 0.47), (-0.06, 0.57), (0.06, 0.57), (0.0, 0.67))):
        x0, x1 = sx - 0.36 + (k % 2) * 0.03, sx + 0.36 - (k % 3) * 0.02
        cylinder(bm, (x0, y, sz + dz), (x1, y, sz + dz), 0.055, 10, m=1)
        cylinder(bm, (x0 - 0.004, y, sz + dz), (x0 + 0.002, y, sz + dz), 0.05, 10, m=2)  # the cut ends
        cylinder(bm, (x1 - 0.002, y, sz + dz), (x1 + 0.004, y, sz + dz), 0.05, 10, m=2)
    bx, bz = sx - 0.1, sz - 0.34
    cylinder(bm, (bx, 0.0, bz), (bx, 1.0, bz), 0.025, 8, m=0)
    box(bm, bx - 0.27, bx + 0.27, 0.76, 0.96, bz + 0.02, bz + 0.05, m=3)
    box(bm, bx - 0.29, bx + 0.29, 0.745, 0.765, bz + 0.015, bz + 0.055, m=0)
    box(bm, bx - 0.29, bx + 0.29, 0.955, 0.975, bz + 0.015, bz + 0.055, m=0)
    stall = make_object("Buster_Stall", bm, ["BU_WoodDark", "BU_Wood", "BU_WoodCut", "BU_Board"], coll, rig, (0.0, 0.0, 0.0))
    texts = [lettering(coll, "FIREWOOD", (bx, 0.86, bz + 0.053), 0.07, "BU_Chalk")]
    with bpy.context.temp_override(object=stall, active_object=stall, selected_objects=[stall, *texts], selected_editable_objects=[stall, *texts]):
        bpy.ops.object.join()
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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials), "parent": o.parent.name if o.parent else ""}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        coll = build(root)
        bpy.context.view_layer.update()
        out = os.path.join(root, "client", "public", "models", "buster.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
