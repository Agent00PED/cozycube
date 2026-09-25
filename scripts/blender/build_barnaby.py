"""Barnaby the Angler, the Campfire's otter fishmonger: builds client/public/models/barnaby.glb.

Run it inside Blender, through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_barnaby.py

or headless:

    blender -b -P scripts/blender/build_barnaby.py

As with the other builders, define REPO_ROOT (and optionally REPORT_PATH, where a JSON summary or
the traceback is written) in front of the body when it is POSTed without a `__file__`.

A plump chibi otter in blue work overalls and an olive bucket hat with a fishing lure stuck in its
band, a bamboo rod in his left paw, beside his tackle stall (a crate of fish on ice and a chalk
board). Stylised clay, every material opaque and matte. The model stands at its own origin, feet
on the ground, facing +z; the game places and turns it (CAMPFIRE_LAYOUT.barnaby). Nodes:

    Barnaby             the root (an empty at his feet)
      Barnaby_Body      legs, feet, the round body, overalls, bib, straps and buttons
        Barnaby_Head    head, muzzle, nose, eyes, ears, whiskers and hat (pivots at the neck:
                        he looks about)
        Barnaby_ArmR    his right arm (pivots at the shoulder: he waves)
        Barnaby_ArmL    his left arm and the bamboo rod in its paw (pivots at the shoulder)
        Barnaby_Tail    his flat otter tail (pivots where it joins: it sways)
      Barnaby_Stall     the tackle crate, the fish on ice and the BAIT & TACKLE board

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION = "Barnaby"

PALETTE = {
    "BN_Fur": "#8A5A3B",
    "BN_FurDark": "#5E3B26",
    "BN_Cream": "#EED9B8",
    "BN_Nose": "#2B211D",
    "BN_Eye": "#1E1B1A",
    "BN_Glint": "#FFFFFF",
    "BN_Blush": "#E89A8C",
    "BN_Overalls": "#4E7FB5",
    "BN_OverallsDark": "#3A628F",
    "BN_Brass": "#D4A548",
    "BN_Hat": "#7D8452",
    "BN_HatBand": "#5A5F38",
    "BN_LureRed": "#D9483B",
    "BN_LureWhite": "#F4EFE6",
    "BN_Bamboo": "#C9B06A",
    "BN_BambooNode": "#9C8446",
    "BN_Reel": "#3E3A36",
    "BN_Line": "#E8E4DA",
    "BN_Crate": "#9C7148",
    "BN_CrateDark": "#7C5838",
    "BN_Ice": "#D6ECF2",
    "BN_FishBlue": "#6FA3C7",
    "BN_FishGold": "#E8B44A",
    "BN_FishPink": "#E88E8E",
    "BN_Board": "#2F3A33",
    "BN_Chalk": "#F2EEE2",
}
ROUGHNESS = {"BN_Eye": 0.35, "BN_Nose": 0.5, "BN_Ice": 0.55, "BN_Brass": 0.6, "BN_Reel": 0.6}


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
    if "__file__" in globals() and __file__.endswith("build_barnaby.py"):
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
# Barnaby

NECK = (0.0, 0.62, 0.0)
SHOULDER_R = (-0.235, 0.53, 0.02)
SHOULDER_L = (0.235, 0.53, 0.02)
TAIL_ROOT = (0.0, 0.2, -0.2)
STALL = (0.62, 0.0, 0.05)


def build(root):
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rig = bpy.data.objects.new("Barnaby", None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]

    # --- the body: legs and feet, the round middle, the overalls over it ---
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, sx * 0.12, 0.12, 0.0, 0.085, 0.1, 0.085, m=0)  # the leg
        blob(bm, sx * 0.13, 0.035, 0.07, 0.08, 0.035, 0.11, m=1, bottom=0.0)  # the foot
    blob(bm, 0.0, 0.42, 0.0, 0.26, 0.25, 0.23, m=0, cuts=5)  # the body
    blob(bm, 0.0, 0.57, 0.14, 0.13, 0.08, 0.1, m=2)  # the cream chest above the bib
    # the overalls: trousers round the lower body and legs, cut flat just under the bib's top
    blob(bm, 0.0, 0.33, 0.0, 0.275, 0.2, 0.245, m=3, cuts=5, top=0.47, bottom=0.14)
    for sx in (-1, 1):
        blob(bm, sx * 0.12, 0.13, 0.0, 0.095, 0.085, 0.095, m=3, bottom=0.07)  # a trouser leg
        blob(bm, sx * 0.12, 0.08, 0.0, 0.1, 0.02, 0.1, m=4)  # its turned-up cuff
    box(bm, -0.13, 0.13, 0.38, 0.575, 0.185, 0.235, m=3)  # the bib
    box(bm, -0.075, 0.075, 0.41, 0.49, 0.232, 0.245, m=4)  # its pocket
    for sx in (-1, 1):
        # the straps, over the shoulders and down the back
        cylinder(bm, (sx * 0.11, 0.565, 0.225), (sx * 0.13, 0.66, 0.08), 0.022, 6, m=4)
        cylinder(bm, (sx * 0.13, 0.66, 0.08), (sx * 0.13, 0.62, -0.14), 0.022, 6, m=4)
        cylinder(bm, (sx * 0.13, 0.62, -0.14), (sx * 0.1, 0.46, -0.215), 0.022, 6, m=4)
        blob(bm, sx * 0.105, 0.55, 0.245, 0.024, 0.024, 0.012, m=5, cuts=2)  # a brass button
    body = make_object("Barnaby_Body", bm, ["BN_Fur", "BN_FurDark", "BN_Cream", "BN_Overalls", "BN_OverallsDark", "BN_Brass"], coll, rig, (0.0, 0.0, 0.0))

    # --- the head (pivots at the neck) ---
    bm = bmesh.new()
    blob(bm, 0.0, 0.79, 0.01, 0.235, 0.205, 0.215, m=0, cuts=5)
    blob(bm, 0.0, 0.72, 0.16, 0.14, 0.085, 0.1, m=1)  # the muzzle
    blob(bm, 0.0, 0.765, 0.255, 0.048, 0.034, 0.032, m=2, cuts=3)  # the nose
    for sx in (-1, 1):
        blob(bm, sx * 0.095, 0.835, 0.185, 0.03, 0.038, 0.022, m=2, cuts=3)  # an eye
        blob(bm, sx * 0.087, 0.85, 0.203, 0.009, 0.009, 0.006, m=3, cuts=1)  # its glint
        blob(bm, sx * 0.155, 0.745, 0.15, 0.04, 0.025, 0.02, m=4, cuts=2)  # a blush
        blob(bm, sx * 0.19, 0.93, -0.02, 0.06, 0.05, 0.035, m=0)  # an ear
        blob(bm, sx * 0.19, 0.93, 0.005, 0.034, 0.028, 0.015, m=1, cuts=2)  # its inside
        for dy in (0.0, 0.03):  # whiskers
            cylinder(bm, (sx * 0.1, 0.715 + dy, 0.235), (sx * 0.28, 0.705 + dy * 1.6, 0.25), 0.004, 4, m=2)
    # the bucket hat, its band and the lure hooked in it
    lathe(bm, 0.0, -0.01, [(0, 0.0), (0.3, 0.0), (0.31, 0.02), (0.2, 0.05), (0.195, 0.16), (0, 0.175)], segs=20, m=5, y0=0.925)
    lathe(bm, 0.0, -0.01, [(0, 0.0), (0.2, 0.0), (0.2, 0.04), (0, 0.04)], segs=20, m=6, y0=0.975)
    blob(bm, 0.2, 1.01, 0.02, 0.03, 0.02, 0.018, m=7, cuts=2)
    blob(bm, 0.225, 1.0, 0.03, 0.016, 0.012, 0.012, m=3, cuts=2)
    cylinder(bm, (0.24, 1.0, 0.035), (0.25, 0.97, 0.04), 0.004, 4, m=2)
    make_object("Barnaby_Head", bm, ["BN_Fur", "BN_Cream", "BN_Nose", "BN_Glint", "BN_Blush", "BN_Hat", "BN_HatBand", "BN_LureRed"], coll, body, NECK)

    # --- the right arm (he waves with it) ---
    bm = bmesh.new()
    cylinder(bm, SHOULDER_R, (-0.3, 0.33, 0.07), 0.058, 10, m=0, r_end=0.05)
    blob(bm, -0.305, 0.31, 0.08, 0.058, 0.055, 0.058, m=1)
    make_object("Barnaby_ArmR", bm, ["BN_Fur", "BN_FurDark"], coll, body, SHOULDER_R)

    # --- the left arm and his bamboo rod ---
    bm = bmesh.new()
    cylinder(bm, SHOULDER_L, (0.3, 0.36, 0.12), 0.058, 10, m=0, r_end=0.05)
    blob(bm, 0.305, 0.34, 0.13, 0.058, 0.055, 0.058, m=1)
    base, tip = Vector((0.3, 0.12, 0.16)), Vector((0.42, 1.72, -0.02))
    for k in range(5):  # the bamboo, section by section, a node ring at each joint
        a = base.lerp(tip, k / 5)
        b = base.lerp(tip, (k + 1) / 5)
        cylinder(bm, tuple(a), tuple(b), 0.02 - k * 0.003, 8, m=2, r_end=0.018 - k * 0.003)
        cylinder(bm, tuple(b - (b - a) * 0.03), tuple(b + (b - a) * 0.03), 0.024 - k * 0.003, 8, m=3)
    reel = base.lerp(tip, 0.1)
    blob(bm, reel.x - 0.04, reel.y, reel.z + 0.03, 0.035, 0.035, 0.018, m=1, cuts=2)
    cylinder(bm, tuple(tip), (0.5, 1.2, 0.05), 0.003, 4, m=4)  # the line, hanging off the tip
    blob(bm, 0.5, 1.18, 0.05, 0.022, 0.03, 0.022, m=5, cuts=2)  # its float
    make_object("Barnaby_ArmL", bm, ["BN_Fur", "BN_FurDark", "BN_Bamboo", "BN_BambooNode", "BN_Line", "BN_LureRed"], coll, body, SHOULDER_L)

    # --- the flat otter tail ---
    bm = bmesh.new()
    cylinder(bm, TAIL_ROOT, (0.0, 0.08, -0.42), 0.075, 10, m=0, r_end=0.06)
    blob(bm, 0.0, 0.05, -0.5, 0.075, 0.035, 0.14, m=0)
    make_object("Barnaby_Tail", bm, ["BN_FurDark"], coll, body, TAIL_ROOT)

    # --- the tackle stall: a crate of fish on ice, and the chalk board ---
    sx, _, sz = STALL
    bm = bmesh.new()
    box(bm, sx - 0.24, sx + 0.24, 0.0, 0.3, sz - 0.17, sz + 0.17, m=0)
    for y in (0.08, 0.18):  # the plank seams
        box(bm, sx - 0.245, sx + 0.245, y, y + 0.02, sz - 0.175, sz + 0.175, m=1)
    box(bm, sx - 0.22, sx + 0.22, 0.3, 0.33, sz - 0.15, sz + 0.15, m=2)  # the ice
    for k, (dx, dz, mat, yaw) in enumerate(((-0.1, -0.05, 3, 0.3), (0.06, 0.04, 4, -0.2), (0.12, -0.08, 5, 0.1))):
        blob(bm, sx + dx, 0.355, sz + dz, 0.09, 0.028, 0.035, m=mat, cuts=3)  # a fish
        blob(bm, sx + dx - 0.1, 0.355, sz + dz, 0.03, 0.022, 0.03, m=mat, cuts=2)  # its tail
    # the board on its post, lettered toward the camera
    bx, bz = sx + 0.12, sz - 0.3
    cylinder(bm, (bx, 0.0, bz), (bx, 1.02, bz), 0.025, 8, m=1)
    box(bm, bx - 0.26, bx + 0.26, 0.76, 1.0, bz + 0.02, bz + 0.05, m=6)
    box(bm, bx - 0.28, bx + 0.28, 0.745, 0.765, bz + 0.015, bz + 0.055, m=1)
    box(bm, bx - 0.28, bx + 0.28, 0.995, 1.015, bz + 0.015, bz + 0.055, m=1)
    stall = make_object("Barnaby_Stall", bm, ["BN_Crate", "BN_CrateDark", "BN_Ice", "BN_FishBlue", "BN_FishGold", "BN_FishPink", "BN_Board"], coll, rig, (0.0, 0.0, 0.0))
    texts = [lettering(coll, "BAIT &", (bx, 0.925, bz + 0.053), 0.075, "BN_Chalk"), lettering(coll, "TACKLE", (bx, 0.83, bz + 0.053), 0.075, "BN_Chalk")]
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
        out = os.path.join(root, "client", "public", "models", "barnaby.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
