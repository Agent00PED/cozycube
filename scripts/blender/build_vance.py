"""Mr. Vance, the Velvet Casino's fox cashier: builds client/public/models/vance.glb.

Run it inside Blender, through the Live Bridge: POST {"code": ...} (the bridge queues it and
returns nothing, and execs with separate globals and locals, so run this file inside a namespace of
its own, with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH). Or headless:

    blender -b -P scripts/blender/build_vance.py

A dapper chibi fox in Barnaby and Buster's proportions: rust-orange fur with a white muzzle,
cheeks, chest and tail tip; a crisp white shirt with its sleeves rolled to the elbow and brass
sleeve garters, a burgundy banker's vest with brass buttons and a watch chain, a black bow tie, a
green accountant's eyeshade and round brass spectacles. He stands at his teller's window with his
paws on the counter, a gold chip in his left paw and a stack of them at his right.

Every colour is a vertex colour and each node is ONE matte clay material, so the whole fox costs a
draw call per node (five). The model stands at its own origin, feet on the ground (the game puts
him on the cage's platform, CASINO_LAYOUT.cage.floor), facing +z. Nodes, as entities/CampNpc.tsx
animates them:

    Vance               the root (an empty at his feet)
      Vance_Body        legs, shoes, the body, shirt, vest, bow tie, the chip stack on the counter
        Vance_Head      head, muzzle, cheeks, nose, eyes, ears, spectacles and eyeshade (pivots at
                        the neck: he looks at whoever comes to the window)
        Vance_ArmR      his right arm, its paw on the counter (pivots at the shoulder: he waves)
        Vance_ArmL      his left arm, a gold chip in its paw (pivots at the shoulder)
        Vance_Tail      his bushy tail, white at the tip (pivots where it joins: it sways)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Vance"
MATERIAL = "VN_Clay"

PALETTE = {
    "Fur": "#C8612B",
    "FurDark": "#8E3F1A",
    "White": "#F3EEE6",
    "Nose": "#1E1A1A",
    "Eye": "#1E1B1A",
    "Glint": "#FFFFFF",
    "Blush": "#E8958A",
    "EarInner": "#3A2420",
    "Shirt": "#F5F2EC",
    "Vest": "#5A1E24",
    "VestDark": "#3E141A",
    "Brass": "#D4A548",
    "Bow": "#161214",
    "Visor": "#2F7A4F",
    "VisorBand": "#1F4F33",
    "Trousers": "#2B2320",
    "Shoe": "#161214",
    "Chip": "#D9A93A",
    "ChipRed": "#A11A22",
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
    if "__file__" in globals() and __file__.endswith("build_vance.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# ---------------------------------------------------------------------------------------------
# shapes: each adds faces to a bmesh in the palette slot `m` (a colour of that node's palette)


def slab(bm, outline, y0, y1, m=0):
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = m
    bm.faces.new(hi).material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m


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


def ring(bm, cx, cy, cz, r, thick, m, segs=12):
    """A thin ring standing in the x-y plane (a spectacle rim), facing +z."""
    for k in range(segs):
        a0, a1 = 2 * math.pi * k / segs, 2 * math.pi * (k + 1) / segs
        cylinder(bm, (cx + r * math.cos(a0), cy + r * math.sin(a0), cz), (cx + r * math.cos(a1), cy + r * math.sin(a1), cz), thick, 5, m=m)


# ---------------------------------------------------------------------------------------------
# Blender plumbing: one vertex-coloured clay material for every node


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
    """The one material: matte clay whose colour is the mesh's vertex colour ("Col")."""
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
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.8
    m.use_backface_culling = True
    return m


def make_object(name, bm, colours, coll, parent=None, pivot=(0.0, 0.0, 0.0)):
    """`bm` as a mesh object `name`, its origin at the game point `pivot`, under `parent`: each
    face painted the colour of its slot in `colours`, all in the one clay material."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    rgba = [(*lin(PALETTE[c]), 1.0) for c in colours]
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


# ---------------------------------------------------------------------------------------------
# Mr. Vance
#
# His paws rest on the counter: in the cage, the platform he stands on is `floor` high and the
# counter `counter` high, its back edge 0.3 in front of him (shared/worlds/casino.ts), so the
# counter's top is PAW_Y over his feet.

NECK = (0.0, 0.6, 0.0)
SHOULDER_R = (-0.2, 0.52, 0.03)
SHOULDER_L = (0.2, 0.52, 0.03)
TAIL_ROOT = (0.0, 0.22, -0.17)


def build(root, layout):
    cage = layout["cage"]
    paw_y = cage["counter"] - cage["floor"]  # the counter's top, over his feet
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rig = bpy.data.objects.new("Vance", None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]

    # --- the body: trousers and shoes, the shirt, the vest over it, the bow tie; the chip stack ---
    colours = ["Trousers", "Shoe", "Shirt", "Vest", "VestDark", "Brass", "Bow", "White", "Chip", "ChipRed", "Fur"]
    T, S, SH, V, VD, BR, BW, WH, CH, CR, FU = range(len(colours))
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, sx * 0.1, 0.13, 0.0, 0.08, 0.12, 0.08, m=T)  # a trouser leg
        blob(bm, sx * 0.11, 0.035, 0.06, 0.075, 0.035, 0.11, m=S, bottom=0.0)  # a shoe
    blob(bm, 0.0, 0.4, 0.0, 0.22, 0.24, 0.2, m=SH, cuts=5)  # the shirt round the body
    blob(bm, 0.0, 0.25, 0.0, 0.225, 0.1, 0.205, m=T, cuts=4, top=0.3)  # the trousers' waist
    # the vest: over the shirt from the waist to the chest, open in a V down the front
    blob(bm, 0.0, 0.39, -0.01, 0.235, 0.2, 0.215, m=V, cuts=5, top=0.53, bottom=0.24)
    blob(bm, 0.0, 0.47, 0.13, 0.085, 0.09, 0.09, m=SH, cuts=3)  # the shirt front in the V
    blob(bm, 0.0, 0.575, 0.08, 0.11, 0.05, 0.1, m=WH, cuts=3)  # the white chest fur at the collar
    for sx in (-1, 1):
        cylinder(bm, (sx * 0.075, 0.53, 0.16), (sx * 0.02, 0.33, 0.2), 0.014, 6, m=VD)  # a lapel edge
        blob(bm, sx * 0.05, 0.575, 0.165, 0.045, 0.028, 0.02, m=BW, cuts=2)  # a bow of the tie
    blob(bm, 0.0, 0.575, 0.18, 0.02, 0.022, 0.015, m=BW, cuts=2)  # its knot
    for k, y in enumerate((0.43, 0.37, 0.31)):  # the vest's brass buttons
        blob(bm, 0.075, y, 0.205 - k * 0.004, 0.017, 0.017, 0.01, m=BR, cuts=2)
    cylinder(bm, (0.075, 0.37, 0.21), (0.14, 0.33, 0.19), 0.006, 4, m=BR)  # the watch chain
    blob(bm, 0.15, 0.32, 0.185, 0.02, 0.025, 0.012, m=BR, cuts=2)  # the watch pocket's fob
    # the stack of gold chips on the counter at his right paw
    for j in range(5):
        lathe(bm, -0.26, 0.42, [(0, 0), (0.045, 0), (0.045, 0.015), (0, 0.015)], segs=12, m=CH if j != 2 else CR, y0=paw_y + j * 0.016)
    body = make_object("Vance_Body", bm, colours, coll, rig, (0.0, 0.0, 0.0))

    # --- the head (pivots at the neck) ---
    colours = ["Fur", "White", "Nose", "Eye", "Glint", "Blush", "EarInner", "Brass", "Visor", "VisorBand", "FurDark"]
    FU, WH, NO, EY, GL, BL, EI, BR, VI, VB, FD = range(len(colours))
    bm = bmesh.new()
    blob(bm, 0.0, 0.8, 0.0, 0.215, 0.19, 0.195, m=FU, cuts=5)  # the head
    blob(bm, 0.0, 0.74, 0.13, 0.12, 0.07, 0.11, m=WH, cuts=4)  # the white muzzle and chin
    blob(bm, 0.0, 0.775, 0.16, 0.075, 0.05, 0.12, m=FU, cuts=3, tilt=-0.15)  # the snout's ridge
    blob(bm, 0.0, 0.78, 0.285, 0.035, 0.028, 0.025, m=NO, cuts=3)  # the nose
    for sx in (-1, 1):
        blob(bm, sx * 0.165, 0.735, 0.07, 0.075, 0.055, 0.06, m=WH, cuts=3)  # a white cheek ruff
        blob(bm, sx * 0.085, 0.835, 0.17, 0.026, 0.034, 0.02, m=EY, cuts=3)  # an eye
        blob(bm, sx * 0.078, 0.848, 0.186, 0.008, 0.008, 0.005, m=GL, cuts=1)  # its glint
        blob(bm, sx * 0.14, 0.77, 0.14, 0.03, 0.02, 0.015, m=BL, cuts=2)  # a blush
        # a tall pointed ear, dark at its tip, dark inside
        cylinder(bm, (sx * 0.12, 0.9, -0.01), (sx * 0.2, 1.13, -0.03), 0.075, 8, m=FU, r_end=0.012)
        cylinder(bm, (sx * 0.12, 0.915, 0.012), (sx * 0.185, 1.09, -0.005), 0.045, 6, m=EI, r_end=0.008)
        cylinder(bm, (sx * 0.185, 1.08, -0.028), (sx * 0.2, 1.13, -0.03), 0.028, 6, m=FD, r_end=0.012)
        # a round brass spectacle rim over the eye
        ring(bm, sx * 0.085, 0.835, 0.2, 0.048, 0.007, BR)
    cylinder(bm, (-0.037, 0.845, 0.205), (0.037, 0.845, 0.205), 0.007, 5, m=BR)  # the bridge
    for sx in (-1, 1):
        cylinder(bm, (sx * 0.133, 0.84, 0.195), (sx * 0.19, 0.85, 0.05), 0.006, 5, m=BR)  # an arm
    # the accountant's eyeshade: a band round the head and a green visor over the eyes
    lathe(bm, 0.0, 0.0, [(0, 0.0), (0.205, 0.0), (0.205, 0.035), (0, 0.035)], segs=20, m=VB, y0=0.9)
    visor = [(0.2 * math.sin(math.radians(a)), 0.1 + 0.2 * math.cos(math.radians(a))) for a in range(-80, 81, 10)]
    visor = [(x, z) for x, z in visor] + [(0.19, 0.08), (-0.19, 0.08)]
    slab(bm, visor, 0.905, 0.92, m=VI)
    make_object("Vance_Head", bm, colours, coll, body, NECK)

    # --- the arms: a rolled white sleeve to the elbow (a brass garter above it), a furry forearm
    # reaching to the counter, a paw resting on its top ---
    def arm(sx, name, chip):
        colours = ["Shirt", "Brass", "Fur", "FurDark", "Chip"]
        SH, BR, FU, FD, CH = range(len(colours))
        bm = bmesh.new()
        shoulder = (sx * 0.2, 0.52, 0.03)
        elbow = (sx * 0.27, 0.4, 0.13)
        paw = (sx * 0.15, paw_y + 0.03, 0.33)
        cylinder(bm, shoulder, elbow, 0.058, 10, m=SH, r_end=0.052)
        mid = tuple(shoulder[k] + (elbow[k] - shoulder[k]) * 0.45 for k in range(3))
        cylinder(bm, tuple(mid[k] - 0.012 * (elbow[k] - shoulder[k]) for k in range(3)), tuple(mid[k] + 0.012 * (elbow[k] - shoulder[k]) for k in range(3)), 0.062, 10, m=BR)
        cylinder(bm, tuple(elbow[k] - 0.05 * (elbow[k] - shoulder[k]) for k in range(3)), tuple(elbow[k] + 0.08 * (paw[k] - elbow[k]) for k in range(3)), 0.066, 10, m=SH)  # the roll
        cylinder(bm, elbow, paw, 0.045, 10, m=FU, r_end=0.04)
        blob(bm, paw[0], paw[1], paw[2], 0.05, 0.035, 0.055, m=FD, cuts=3)
        if chip:
            lathe(bm, paw[0] + sx * 0.01, paw[2] + 0.04, [(0, 0), (0.04, 0), (0.04, 0.014), (0, 0.014)], segs=12, m=CH, y0=paw[1] + 0.02)
        return make_object(name, bm, colours, coll, body, shoulder)

    arm(-1, "Vance_ArmR", False)
    arm(1, "Vance_ArmL", True)

    # --- the bushy tail, curling up behind him, white at the tip ---
    colours = ["Fur", "White"]
    bm = bmesh.new()
    blob(bm, 0.02, 0.22, -0.27, 0.075, 0.075, 0.11, m=0, cuts=3)
    blob(bm, 0.05, 0.34, -0.39, 0.11, 0.13, 0.11, m=0, cuts=4, tilt=0.5)
    blob(bm, 0.07, 0.5, -0.42, 0.095, 0.1, 0.09, m=0, cuts=4, tilt=0.8)
    blob(bm, 0.08, 0.62, -0.38, 0.07, 0.07, 0.065, m=1, cuts=3)
    make_object("Vance_Tail", bm, colours, coll, body, TAIL_ROOT)
    return coll


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


def read_layout(root):
    import re

    src = open(os.path.join(root, "shared", "worlds", "casino.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


def summary(coll):
    out = {}
    for o in coll.all_objects:
        if o.data is None:
            continue
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials), "colours": len(o.data.color_attributes), "parent": o.parent.name if o.parent else ""}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        coll = build(root, read_layout(root))
        bpy.context.view_layer.update()
        out = os.path.join(root, "client", "public", "models", "vance.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
