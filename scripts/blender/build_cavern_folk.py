"""The Glimmering Caverns' folk: builds client/public/models/gus.glb (Gus the Mole, the caverns'
prospector and trader, seated on a stump at his log workstation in the Sunlit Doline),
client/public/models/old_flint.glb (Old Flint the Badger, who keeps the old mine adit behind the
Whispering Woods' Autumn Maples, his brass lantern lit) and client/public/models/finnegan.glb
(Finnegan the Grotto Angler, an old axolotl in an oilskin, on his driftwood log on the Cenote's sand).

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b --factory-startup -P scripts/blender/build_cavern_folk.py

Built the way Bramble and the casino's staff are (scripts/blender/build_bramble.py): every colour a
vertex colour and each node ONE matte clay material, so the game fuses a character into one skinned
mesh, one draw call; Old Flint's helmet lamp is a second material that glows (FL_Lamp). Each stands at
their own origin facing +z; the game places and turns them (CAVERNS_LAYOUT.gus, FOREST_LAYOUT.flint).
The nodes entities/CampNpc.tsx animates:

    Gus                 the root (an empty at his feet)
      Gus_Body          a round velvety mole in a leather prospector's apron, a tool belt, boots
        Gus_Head        his head, pink star nose, tiny eyes behind round brass spectacles, a
                        jeweller's loupe pushed up on his brow (pivots at the neck)
        Gus_ArmR        his right arm, its big digging claws on the counter (pivots at the shoulder)
        Gus_ArmL        his left arm, a gem held up between two claws (pivots at the shoulder)
        Gus_Tail        a stubby pink tail
    Finnegan            the root (an empty at the log's foot)
      Finnegan_Log      his driftwood log, his reed creel beside it, his iron tackle box and his
                        lantern on the sand (still)
      Finnegan_Body     a plump pink axolotl in a yellow oilskin coat, seated (pivots on the log)
        Finnegan_Head   his wide smiling head, feathery gills either side, a sou'wester hat
        Finnegan_ArmR   his right arm (pivots at the shoulder: he waves)
        Finnegan_ArmL   his left arm holding the rod out over the water, a glowing lure on its line
        Finnegan_Tail   his long finned tail, curled round the log
    OldFlint            the root
      OldFlint_Body     a stout grey badger, a heavy leather apron over a work shirt, braces, boots
        OldFlint_Head   the badger's striped face, bushy brows, a miner's hard hat with its lamp
                        (the lamp's glass in FL_Lamp, glowing warm) (pivots at the neck)
        OldFlint_ArmR   his right arm, resting on the pickaxe planted beside him
        OldFlint_ArmL   his left arm, a thumb hooked in his apron
        OldFlint_Tail   a short bristly tail

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

MATERIAL = "CF_Clay"
LAMP = "FL_Lamp"

PALETTE = {
    # Gus
    "Velvet": "#4A4550",
    "VelvetDark": "#35303A",
    "Belly": "#7A7282",
    "Nose": "#F29BB0",
    "NoseDark": "#D4728C",
    "Claw": "#F2E3D0",
    "Palm": "#E8A9B6",
    "Eye": "#141214",
    "Glint": "#FFFFFF",
    "Brass": "#C9973E",
    "Glass": "#BFE6F2",
    "Apron": "#8A5A34",
    "ApronDark": "#6B4228",
    "Belt": "#4A2E1C",
    "Buckle": "#D4A548",
    "Boot": "#3D2A1F",
    "Gem": "#5FF2FF",
    "Shirt": "#C9B79A",
    # Old Flint
    "Badger": "#7C7F86",
    "BadgerDark": "#3A3B40",
    "BadgerWhite": "#EDEBE6",
    "BadgerCream": "#D9D2C3",
    "Brow": "#F4F2EE",
    "FlintShirt": "#5E6B7A",
    "Leather": "#6B4228",
    "LeatherDark": "#4E2F1B",
    "Braces": "#8A3B2A",
    "Helmet": "#D9A43A",
    "HelmetDark": "#A87A25",
    "Lamp": "#FFD58A",
    "Iron": "#3A3836",
    "Steel": "#9AA0AA",
    "Handle": "#8A5A34",
    "Blush": "#E0937F",
    # Finnegan
    "Axo": "#F2B8C6",
    "AxoLight": "#FAD9E0",
    "AxoGill": "#E0607E",
    "AxoGillTip": "#FF96AE",
    "Coat": "#E8B83A",
    "CoatDark": "#B8892A",
    "Crate": "#A89C8C",
    "CrateDark": "#7E7366",
    "Rod": "#8A5A34",
    "Line": "#EDEBE6",
    "Tin": "#6F8A9A",
    "Bark": "#8F8172",
    "BarkDark": "#6A5E52",
    "Heartwood": "#C9B89A",
    "Reed": "#C2A462",
    "ReedDark": "#8E7440",
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
    if "__file__" in globals() and __file__.endswith("build_cavern_folk.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root, world):
    src = open(os.path.join(root, "shared", "worlds", f"{world}.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


# ---------------------------------------------------------------------------------------------
# shapes: each adds faces to a Part in a colour slot `c` (a name from PALETTE), with the element
# tags kept apart per shape (never sets of BMesh wrappers)


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
    for ring in (list(reversed(ring_a)), ring_b):
        bm.faces.new(ring).material_index = m


def lathe(P, cx, cz, profile, c, segs=16, y0=0.0):
    bm, m = P.bm, P.c(c)
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = [[bm.verts.new(W(cx + r * math.cos(2 * math.pi * k / segs), y0 + h, cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)] for r, h in profile[1:-1]]
    for k in range(segs):
        k1 = (k + 1) % segs
        faces = [bm.faces.new((bottom, rings[0][k], rings[0][k1])), bm.faces.new((top, rings[-1][k1], rings[-1][k]))]
        faces += [bm.faces.new((r0[k], r1[k], r1[k1], r0[k1])) for r0, r1 in zip(rings, rings[1:])]
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


def box(P, x0, x1, y0, y1, z0, z1, c):
    bm, m = P.bm, P.c(c)
    lo = [bm.verts.new(W(x, y0, z)) for x, z in ((x0, z0), (x0, z1), (x1, z1), (x1, z0))]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in ((x0, z0), (x0, z1), (x1, z1), (x1, z0))]
    faces = [bm.faces.new(list(reversed(hi))), bm.faces.new(lo)]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((lo[j], lo[i], hi[i], hi[j])))
    for f in faces:
        f.material_index = m


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


def lamp():
    """The helmet lamp's glass: warm, glowing."""
    m = bpy.data.materials.get(LAMP) or bpy.data.materials.new(LAMP)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = lin(PALETTE["Lamp"])
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    bsdf.inputs[key].default_value = (*c, 1)
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 5.0
    bsdf.inputs["Roughness"].default_value = 0.4
    m.diffuse_color = (*c, 1)
    return m


def node(name, P, coll, parent=None, pivot=(0.0, 0.0, 0.0), glowing=()):
    """The Part as a node: its colours painted into "Col"; the colours in `glowing` in the lamp's
    material (a second draw call), the rest in the clay."""
    bm = P.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    rgba = [(*lin(PALETTE[c]), 1.0) for c in P.colours]
    lit = [c in glowing for c in P.colours]
    for f in bm.faces:
        for loop in f.loops:
            loop[col] = rgba[f.material_index]
        f.material_index = 1 if lit[f.material_index] else 0
    shift = W(*pivot)
    for v in bm.verts:
        v.co -= shift
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(clay())
    if any(lit):
        me.materials.append(lamp())
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


def rig_root(name, coll):
    rig = bpy.data.objects.new(name, None)
    rig.empty_display_type = "PLAIN_AXES"
    coll.objects.link(rig)
    rig["pivot"] = [0.0, 0.0, 0.0]
    return rig


def eyes(P, x, y, z, hx, hy):
    for sx in (-1, 1):
        blob(P, sx * x, y, z, hx, hy, 0.018, "Eye", cuts=2)
        blob(P, sx * x - 0.007, y + hy * 0.35, z + 0.015, 0.008, 0.008, 0.004, "Glint", cuts=1)


# ---------------------------------------------------------------------------------------------
# Gus the Mole


def build_gus(root):
    L = read_layout(root, "caverns")
    purge("Gus")
    coll = bpy.data.collections.new("Gus")
    bpy.context.scene.collection.children.link(coll)
    rig = rig_root("Gus", coll)
    counter = L["workstation"]
    ahead = abs(counter["z"] - L["gus"]["z"]) - counter["w"] / 2
    top = counter["top"] + 0.02

    B = Part()
    # the stump he sits on, his boots forward under the log
    cylinder(B, (0.0, 0.0, -0.14), (0.0, 0.3, -0.14), 0.24, "ApronDark", sides=12, r_end=0.22)
    for sx in (-1, 1):
        blob(B, sx * 0.13, 0.07, 0.16, 0.11, 0.07, 0.15, "Boot", bottom=0.0)
        blob(B, sx * 0.13, 0.22, 0.06, 0.1, 0.12, 0.12, "VelvetDark")
    blob(B, 0.0, 0.55, 0.0, 0.33, 0.38, 0.3, "Velvet", cuts=4)
    blob(B, 0.0, 0.5, 0.2, 0.2, 0.24, 0.12, "Belly", cuts=3)
    # the leather apron: a bib and a skirt, pockets with a hammer's handle and a brush
    blob(B, 0.0, 0.52, 0.03, 0.345, 0.3, 0.315, "Apron", cuts=4, top=0.74, bottom=0.26)
    blob(B, 0.0, 0.8, 0.26, 0.15, 0.1, 0.05, "Apron", cuts=2)
    for sx in (-1, 1):
        box(B, sx * 0.19 - 0.06, sx * 0.19 + 0.06, 0.38, 0.5, 0.33, 0.36, "ApronDark")
    box(B, -0.22, -0.2, 0.46, 0.62, 0.345, 0.365, "Handle")
    blob(B, 0.2, 0.52, 0.36, 0.035, 0.05, 0.02, "Buckle", cuts=1)
    # the tool belt, a brass buckle
    blob(B, 0.0, 0.3, 0.0, 0.355, 0.045, 0.32, "Belt", cuts=3)
    blob(B, 0.0, 0.3, 0.32, 0.045, 0.035, 0.015, "Buckle", cuts=1)
    for sx in (-1, 1):
        cylinder(B, (sx * 0.13, 0.74, 0.28), (sx * 0.2, 0.9, 0.12), 0.02, "Belt", sides=6)
    body = node("Gus_Body", B, coll, rig)

    H = Part()
    neck = (0.0, 0.88, 0.0)
    blob(H, 0.0, 1.06, 0.02, 0.27, 0.24, 0.27, "Velvet", cuts=4)
    blob(H, 0.0, 1.0, 0.2, 0.15, 0.12, 0.17, "Velvet", cuts=3)
    # the pink star nose: a round snout ringed with little fleshy rays
    blob(H, 0.0, 1.0, 0.37, 0.055, 0.05, 0.04, "Nose", cuts=2)
    for k in range(10):
        a = 2 * math.pi * k / 10
        blob(H, 0.07 * math.cos(a), 1.0 + 0.065 * math.sin(a), 0.36, 0.022, 0.018, 0.02, "NoseDark", cuts=1)
    blob(H, 0.0, 0.93, 0.3, 0.05, 0.012, 0.012, "VelvetDark", cuts=1)
    eyes(H, 0.085, 1.1, 0.25, 0.018, 0.02)
    # round brass spectacles over the eyes
    for sx in (-1, 1):
        lathe(H, sx * 0.085, 0.265, [(0, 0.0), (0.05, 0.0), (0.05, 0.012), (0, 0.012)], "Glass", segs=14, y0=1.1 - 0.006)
        cylinder(H, (sx * 0.085 - 0.05, 1.1, 0.27), (sx * 0.085 + 0.05, 1.1, 0.27), 0.006, "Brass", sides=5)
    cylinder(H, (-0.035, 1.1, 0.275), (0.035, 1.1, 0.275), 0.006, "Brass", sides=5)
    # the jeweller's loupe pushed up on his brow (its lens toward us)
    cylinder(H, (0.07, 1.22, 0.2), (0.07, 1.25, 0.27), 0.032, "Brass", sides=10, r_end=0.028)
    blob(H, 0.07, 1.252, 0.272, 0.022, 0.022, 0.006, "Glass", cuts=1)
    # a tuft of velvet on his crown
    blob(H, 0.0, 1.29, 0.02, 0.07, 0.035, 0.06, "VelvetDark", cuts=2)
    for sx in (-1, 1):
        blob(H, sx * 0.21, 1.14, -0.04, 0.05, 0.04, 0.03, "VelvetDark", cuts=1)
    node("Gus_Head", H, coll, body, neck)

    for sx, name in ((-1, "Gus_ArmR"), (1, "Gus_ArmL")):
        A = Part()
        shoulder = (sx * 0.3, 0.72, 0.03)
        if name == "Gus_ArmR":
            paw = (sx * 0.24, top + 0.03, ahead + 0.1)
        else:
            paw = (sx * 0.2, 0.95, 0.3)
        elbow = ((shoulder[0] + paw[0]) / 2 + sx * 0.08, (shoulder[1] + paw[1]) / 2 - 0.08, (shoulder[2] + paw[2]) / 2)
        cylinder(A, shoulder, elbow, 0.07, "Velvet", r_end=0.066)
        cylinder(A, elbow, paw, 0.066, "Velvet", r_end=0.07)
        blob(A, paw[0], paw[1], paw[2], 0.1, 0.05, 0.09, "Palm", cuts=2)
        # the big digging claws
        for k in range(4):
            cz = paw[2] + 0.07
            cylinder(A, (paw[0] + (k - 1.5) * 0.04, paw[1], cz), (paw[0] + (k - 1.5) * 0.045, paw[1] - 0.02, cz + 0.07), 0.013, "Claw", sides=5, r_end=0.003)
        if name == "Gus_ArmL":
            blob(A, paw[0], paw[1] + 0.09, paw[2] + 0.02, 0.035, 0.05, 0.035, "Gem", cuts=1)
        node(name, A, coll, body, shoulder)

    T = Part()
    cylinder(T, (0.0, 0.3, -0.28), (0.0, 0.2, -0.42), 0.03, "Nose", sides=6, r_end=0.012)
    node("Gus_Tail", T, coll, body, (0.0, 0.3, -0.27))
    return coll


# ---------------------------------------------------------------------------------------------
# Old Flint the Badger


def build_flint(root):
    purge("OldFlint")
    coll = bpy.data.collections.new("OldFlint")
    bpy.context.scene.collection.children.link(coll)
    rig = rig_root("OldFlint", coll)

    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.14, 0.07, 0.04, 0.12, 0.07, 0.16, "Boot", bottom=0.0)
        blob(B, sx * 0.14, 0.22, 0.0, 0.11, 0.14, 0.11, "BadgerDark")
    blob(B, 0.0, 0.6, 0.0, 0.36, 0.38, 0.3, "FlintShirt", cuts=4)
    # the heavy leather apron to the knees, its bib, rivets
    blob(B, 0.0, 0.52, 0.04, 0.375, 0.34, 0.32, "Leather", cuts=4, top=0.78, bottom=0.2)
    blob(B, 0.0, 0.86, 0.26, 0.17, 0.12, 0.05, "Leather", cuts=2)
    for sx in (-1, 1):
        blob(B, sx * 0.14, 0.95, 0.27, 0.018, 0.018, 0.01, "Steel", cuts=1)
        cylinder(B, (sx * 0.14, 0.95, 0.27), (sx * 0.2, 1.02, 0.08), 0.022, "Braces", sides=6)
    box(B, -0.16, 0.16, 0.48, 0.6, 0.345, 0.37, "LeatherDark")
    body = node("OldFlint_Body", B, coll, rig)

    H = Part()
    neck = (0.0, 0.98, 0.0)
    # a badger's face: white with a dark stripe down each eye, a white blaze up the middle
    blob(H, 0.0, 1.18, 0.02, 0.27, 0.24, 0.26, "BadgerWhite", cuts=4)
    for sx in (-1, 1):
        blob(H, sx * 0.1, 1.2, 0.08, 0.075, 0.2, 0.2, "BadgerDark", cuts=3)
    blob(H, 0.0, 1.08, 0.22, 0.12, 0.09, 0.14, "BadgerWhite", cuts=3)
    blob(H, 0.0, 1.1, 0.35, 0.04, 0.03, 0.03, "BadgerDark", cuts=2)
    eyes(H, 0.1, 1.19, 0.24, 0.02, 0.024)
    for sx in (-1, 1):
        blob(H, sx * 0.1, 1.25, 0.25, 0.05, 0.02, 0.02, "Brow", cuts=1)  # bushy white brows
        blob(H, sx * 0.24, 1.26, -0.03, 0.05, 0.04, 0.03, "BadgerDark", cuts=1)
        blob(H, sx * 0.16, 1.07, 0.22, 0.03, 0.018, 0.012, "Blush", cuts=1)
    # a white whiskery moustache
    for sx in (-1, 1):
        blob(H, sx * 0.05, 1.04, 0.33, 0.06, 0.025, 0.025, "Brow", cuts=1)
    # the miner's hard hat: a dome, a brim, the lamp on its front (its glass glows)
    lathe(H, 0.0, 0.0, [(0, 0.0), (0.3, 0.0), (0.31, 0.02), (0.3, 0.035), (0, 0.035)], "HelmetDark", segs=22, y0=1.33)
    lathe(H, 0.0, 0.0, [(0, 0.0), (0.24, 0.0), (0.235, 0.08), (0.2, 0.15), (0.12, 0.2), (0, 0.21)], "Helmet", segs=20, y0=1.35)
    cylinder(H, (0.0, 1.43, 0.2), (0.0, 1.43, 0.3), 0.06, "Iron", sides=10)
    lathe(H, 0.0, 0.3, [(0, 0.0), (0.05, 0.0), (0.05, 0.01), (0, 0.01)], "Lamp", segs=12, y0=1.43 - 0.005)
    blob(H, 0.0, 1.43, 0.305, 0.045, 0.045, 0.012, "Lamp", cuts=2)
    # the brass safety lantern hung at his belt, lit
    lathe(H, 0.22, 0.24, [(0, 0.0), (0.05, 0.0), (0.06, 0.08), (0.045, 0.13), (0, 0.14)], "Lamp", segs=10, y0=0.62)
    lathe(H, 0.22, 0.24, [(0, 0.12), (0.065, 0.12), (0.03, 0.17), (0, 0.18)], "Helmet", segs=10, y0=0.62)
    node("OldFlint_Head", H, coll, body, neck, glowing=("Lamp",))

    # his right arm resting on the pickaxe planted beside him; the left thumb in the apron
    A = Part()
    shoulder = (-0.33, 0.86, 0.02)
    paw = (-0.46, 0.78, 0.2)
    cylinder(A, shoulder, paw, 0.08, "FlintShirt", r_end=0.075)
    blob(A, paw[0], paw[1], paw[2], 0.07, 0.06, 0.07, "BadgerDark", cuts=2)
    # the pickaxe: its haft planted on the ground, its head up by his paw
    cylinder(A, (-0.5, 0.0, 0.25), (-0.46, 0.84, 0.2), 0.022, "Handle", sides=6)
    cylinder(A, (-0.46, 0.84, 0.02), (-0.46, 0.86, 0.4), 0.03, "Steel", sides=6, r_end=0.008)
    node("OldFlint_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.33, 0.86, 0.02)
    paw = (0.2, 0.62, 0.3)
    cylinder(A, shoulder, paw, 0.08, "FlintShirt", r_end=0.075)
    blob(A, paw[0], paw[1], paw[2], 0.065, 0.06, 0.06, "BadgerDark", cuts=2)
    node("OldFlint_ArmL", A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.34, -0.33, 0.06, 0.05, 0.08, "BadgerDark", cuts=2)
    node("OldFlint_Tail", T, coll, body, (0.0, 0.34, -0.28))
    return coll


# ---------------------------------------------------------------------------------------------
# Finnegan the Grotto Angler


def build_finnegan(root):
    purge("Finnegan")
    coll = bpy.data.collections.new("Finnegan")
    bpy.context.scene.collection.children.link(coll)
    rig = rig_root("Finnegan", coll)
    top = 0.44  # the log's top

    # --- the log: a flat-topped length of silvered driftwood lying on the sand across him, its ends
    # sawn pale, a broken branch stub; his reed creel beside him, his lantern on the sand ---
    R = Part()
    cylinder(R, (-0.75, 0.2, -0.02), (0.75, 0.21, 0.02), 0.22, "Bark", sides=10)
    box(R, -0.7, 0.7, top - 0.05, top, -0.13, 0.13, "Crate")
    for sx in (-1, 1):
        cylinder(R, (sx * 0.755, 0.2, 0.0), (sx * 0.77, 0.2, 0.0), 0.19, "Heartwood", sides=10)
    for k in range(5):
        x = -0.6 + k * 0.3
        cylinder(R, (x, 0.2, -0.02), (x + 0.03, 0.2, -0.02), 0.225, "BarkDark", sides=10)
    cylinder(R, (0.35, 0.3, -0.18), (0.48, 0.42, -0.36), 0.05, "BarkDark", sides=6, r_end=0.03)
    # the creel: woven reed, banded, its lid ajar
    for k in range(5):
        y0 = k * 0.06
        lathe(R, 0.62, 0.42, [(0, y0), (0.15 + 0.01 * (k % 2), y0), (0.155, y0 + 0.06), (0, y0 + 0.06)], "Reed" if k % 2 else "ReedDark", segs=10)
    lathe(R, 0.64, 0.42, [(0, 0.3), (0.16, 0.3), (0.12, 0.34), (0, 0.35)], "ReedDark", segs=10)
    cylinder(R, (0.5, 0.36, 0.42), (0.74, 0.36, 0.42), 0.01, "CrateDark", sides=4)
    # his iron tackle box on the sand, its brass clasp, the handle folded down
    box(R, -0.42, -0.1, 0.0, 0.15, 0.28, 0.48, "Iron")
    box(R, -0.43, -0.09, 0.15, 0.17, 0.27, 0.49, "Tin")
    box(R, -0.28, -0.24, 0.1, 0.16, 0.485, 0.5, "CoatDark")
    cylinder(R, (-0.34, 0.18, 0.38), (-0.18, 0.18, 0.38), 0.012, "Steel", sides=5)
    # the lantern on the sand
    lathe(R, -0.62, 0.36, [(0, 0.0), (0.06, 0.0), (0.07, 0.09), (0.05, 0.15), (0, 0.16)], "Lamp", segs=10)
    lathe(R, -0.62, 0.36, [(0, 0.14), (0.075, 0.14), (0.03, 0.2), (0, 0.21)], "CoatDark", segs=10)
    node("Finnegan_Log", R, coll, rig, glowing=("Lamp",))

    # --- the body: a plump axolotl seated on the lid, his oilskin coat, his stubby legs forward ---
    B = Part()
    blob(B, 0.0, top + 0.24, 0.0, 0.25, 0.26, 0.21, "Axo", cuts=4)
    blob(B, 0.0, top + 0.22, 0.13, 0.15, 0.18, 0.1, "AxoLight", cuts=3)
    blob(B, 0.0, top + 0.28, -0.01, 0.265, 0.22, 0.22, "Coat", cuts=4, top=top + 0.48, bottom=top + 0.06)
    blob(B, 0.0, top + 0.26, 0.16, 0.12, 0.16, 0.08, "AxoLight", cuts=3)  # the coat open over his belly
    for k in range(3):
        blob(B, 0.09, top + 0.34 - k * 0.09, 0.19, 0.016, 0.016, 0.01, "CoatDark", cuts=1)
    for sx in (-1, 1):
        blob(B, sx * 0.12, top + 0.06, 0.22, 0.07, 0.06, 0.13, "Axo", cuts=2)
        blob(B, sx * 0.12, top + 0.02, 0.33, 0.06, 0.03, 0.05, "AxoLight", cuts=1)
    body = node("Finnegan_Body", B, coll, rig, (0.0, top, 0.0))

    # --- the head: wide and flat, a big gentle smile, little dark eyes, three feathery gills a side,
    # a sou'wester hat ---
    H = Part()
    neck = (0.0, top + 0.46, 0.0)
    blob(H, 0.0, top + 0.62, 0.03, 0.26, 0.17, 0.22, "Axo", cuts=4)
    blob(H, 0.0, top + 0.57, 0.16, 0.18, 0.08, 0.1, "AxoLight", cuts=3)
    cylinder(H, (-0.11, top + 0.57, 0.24), (0.11, top + 0.57, 0.24), 0.008, "AxoGill", sides=5)
    eyes(H, 0.12, top + 0.66, 0.2, 0.016, 0.018)
    for sx in (-1, 1):
        for k in range(3):
            a = math.radians(-35 + 35 * k)
            base = (sx * 0.22, top + 0.64 + 0.04 * (1 - k), 0.0)
            tip = (sx * (0.36 + 0.03 * math.cos(a)), top + 0.64 + 0.14 * math.sin(a) + 0.05, -0.03 - 0.03 * k)
            cylinder(H, base, tip, 0.022, "AxoGill", sides=6, r_end=0.012)
            for j in range(3):
                t = (j + 1) / 4
                px, py, pz = base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t
                blob(H, px, py + 0.02, pz, 0.018, 0.03, 0.012, "AxoGillTip", cuts=1)
    # the sou'wester: a floppy yellow brim, low at the back
    lathe(H, 0.0, 0.0, [(0, 0.0), (0.27, 0.0), (0.28, 0.02), (0.26, 0.03), (0, 0.03)], "CoatDark", segs=20, y0=top + 0.74)
    lathe(H, 0.0, 0.0, [(0, 0.0), (0.18, 0.0), (0.17, 0.07), (0.12, 0.12), (0, 0.13)], "Coat", segs=18, y0=top + 0.76)
    node("Finnegan_Head", H, coll, body, neck)

    # --- the arms: the right on his knee (he waves), the left holding the rod out over the water ---
    A = Part()
    shoulder = (-0.24, top + 0.38, 0.03)
    paw = (-0.2, top + 0.2, 0.24)
    cylinder(A, shoulder, paw, 0.055, "Coat", r_end=0.05)
    blob(A, paw[0], paw[1], paw[2], 0.05, 0.04, 0.05, "Axo", cuts=2)
    node("Finnegan_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.24, top + 0.38, 0.03)
    paw = (0.28, top + 0.3, 0.26)
    cylinder(A, shoulder, paw, 0.055, "Coat", r_end=0.05)
    blob(A, paw[0], paw[1], paw[2], 0.05, 0.045, 0.05, "Axo", cuts=2)
    rod_tip = (0.5, top + 1.25, 1.45)
    cylinder(A, (paw[0] - 0.02, paw[1] - 0.12, paw[2] - 0.2), rod_tip, 0.016, "Rod", sides=6, r_end=0.006)
    cylinder(A, rod_tip, (0.52, top - 0.15, 1.6), 0.003, "Line", sides=4)
    blob(A, 0.52, top - 0.17, 1.6, 0.025, 0.035, 0.025, "Lamp", cuts=1)
    node("Finnegan_ArmL", A, coll, body, shoulder, glowing=("Lamp",))

    T = Part()
    cylinder(T, (0.0, top + 0.12, -0.18), (0.18, top - 0.05, -0.4), 0.07, "Axo", sides=8, r_end=0.04)
    cylinder(T, (0.18, top - 0.05, -0.4), (0.38, top - 0.2, -0.3), 0.04, "Axo", sides=8, r_end=0.015)
    blob(T, 0.2, top + 0.02, -0.4, 0.015, 0.08, 0.14, "AxoLight", cuts=1)
    node("Finnegan_Tail", T, coll, body, (0.0, top + 0.12, -0.16))
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
        result = {"ok": True}
        colls = []
        for fn, file in ((build_gus, "gus.glb"), (build_flint, "old_flint.glb"), (build_finnegan, "finnegan.glb")):
            coll = fn(root)
            bpy.context.view_layer.update()
            out = os.path.join(root, "client", "public", "models", file)
            export(coll, out)
            result[file] = {"bytes": os.path.getsize(out), **summary(coll)}
            colls.append(coll)
        result["studio"] = studio(root, "finish", colls)
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
