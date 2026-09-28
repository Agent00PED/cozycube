"""The wild critters of the Starlight Campfire and the Whispering Woods: builds
client/public/models/critters.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_critters.py

Three nodes, each ONE mesh with every colour a vertex colour in one matte clay material (the game
draws each kind instanced: a draw call per kind for the whole map), standing on the ground at the
origin (y = 0 under their feet) and facing +z (the game's heading 0):

    Critter_Rabbit     a wild brown rabbit, sitting up: long ears, a cotton tail, big hind feet
    Critter_Squirrel   a red squirrel on its haunches, its bushy tail curled up over its back
    Critter_Deer       a dappled roe doe, low-poly and chibi (a big head, sturdy short legs)

Chibi-proportioned (big heads, soft rounded bodies) to sit beside the avatars; the game scales each
kind (client/src/scene/WildCritters.tsx). They wander their territory, stop to sniff and nibble,
and bolt from anyone who comes close.

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Euler, Vector

COLLECTION = "Critters"
MATERIAL = "CR_Clay"


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hash01(a, b):
    v = math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return v - math.floor(v)


def W(x, y, z):
    return Vector((x, -z, y))


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_critters.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


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
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.8
    m.use_backface_culling = True
    return m


class Critter:
    """A critter's mesh as it is built, in game coordinates: each vertex carries its colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.vc = self.bm.verts.layers.float_color.new("vc")

    def vert(self, p, rgb):
        v = self.bm.verts.new(W(*p))
        v[self.vc] = (*rgb, 1.0)
        return v

    def face(self, vs):
        f = self.bm.faces.new(vs)
        f.smooth = True
        return f


def ellipsoid(C, c, r, col, segs=12, rings=8, rot=(0.0, 0.0, 0.0)):
    """A rounded lump at c (game coords), radii r along its own axes, turned by `rot` (Euler XYZ in
    game space). `col`: an rgb, or a function of the unit direction (nx, ny, nz) giving one."""
    R = Euler(rot, "XYZ").to_matrix()
    paint = col if callable(col) else (lambda nx, ny, nz: col)

    def at(nx, ny, nz):
        o = R @ Vector((r[0] * nx, r[1] * ny, r[2] * nz))
        return (c[0] + o.x, c[1] + o.y, c[2] + o.z), paint(nx, ny, nz)

    top = C.vert(*at(0, 1, 0))
    bottom = C.vert(*at(0, -1, 0))
    rows = []
    for i in range(1, rings):
        phi = math.pi * i / rings
        row = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            nx, ny, nz = math.sin(phi) * math.sin(th), math.cos(phi), math.sin(phi) * math.cos(th)
            row.append(C.vert(*at(nx, ny, nz)))
        rows.append(row)
    for j in range(segs):
        C.face([top, rows[0][(j + 1) % segs], rows[0][j]])
        C.face([bottom, rows[-1][j], rows[-1][(j + 1) % segs]])
    for i in range(len(rows) - 1):
        for j in range(segs):
            C.face([rows[i][j], rows[i][(j + 1) % segs], rows[i + 1][(j + 1) % segs], rows[i + 1][j]])


def limb(C, a, b, r0, r1, col, segs=8, col_end=None):
    """A tapered, capped limb from a to b (game coords); `col_end` paints its last stretch (a hoof)."""
    A, B = Vector(a), Vector(b)
    axis = (B - A).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = side.cross(axis).normalized()
    stops = [(0.0, r0, col), (0.72, r0 + (r1 - r0) * 0.72, col), (0.74, r0 + (r1 - r0) * 0.74, col_end or col), (1.0, r1, col_end or col)]
    rings = []
    for u, rr, cc in stops:
        p = A.lerp(B, u)
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            q = p + side * (math.cos(th) * rr) + up * (math.sin(th) * rr)
            ring.append(C.vert((q.x, q.y, q.z), cc))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segs):
            C.face([rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]])
    ca = C.vert(a, col)
    cb = C.vert(b, col_end or col)
    for j in range(segs):
        C.face([ca, rings[0][(j + 1) % segs], rings[0][j]])
        C.face([cb, rings[-1][j], rings[-1][(j + 1) % segs]])


def shaded(top, bottom, belly_from=-0.25):
    """Colour by height on the lump: `top` above, `bottom` (a pale belly) underneath."""
    t, b = lin(top), lin(bottom)
    return lambda nx, ny, nz: mix(t, b, (belly_from - ny) / 0.45)


# ---------------------------------------------------------------------------------------------
# the critters


def rabbit(C):
    fur, belly, dark = "#9C7A58", "#EFE3D0", "#6E5238"
    # the body, sitting up a little, and the haunches
    ellipsoid(C, (0, 0.13, -0.02), (0.11, 0.1, 0.15), shaded(fur, belly), rot=(-0.25, 0, 0))
    for sx in (-1, 1):
        ellipsoid(C, (sx * 0.065, 0.1, -0.08), (0.06, 0.075, 0.085), shaded(fur, belly, -0.1))
        # the big hind feet, flat on the ground
        ellipsoid(C, (sx * 0.075, 0.025, -0.03), (0.032, 0.025, 0.075), lin(belly), segs=8, rings=5)
        # the front paws
        ellipsoid(C, (sx * 0.045, 0.03, 0.085), (0.024, 0.03, 0.032), lin(belly), segs=8, rings=5)
    # the head, big and round, the cheeks paler
    ellipsoid(C, (0, 0.25, 0.1), (0.085, 0.078, 0.088), shaded(fur, belly, -0.35))
    # the ears: long, laid back a little, pink inside (their front face)
    for sx in (-1, 1):
        pink = lin("#E8A7A2")
        ear = lin(fur)
        tip = lin(dark)
        ellipsoid(C, (sx * 0.038, 0.38, 0.07), (0.026, 0.1, 0.014), lambda nx, ny, nz, e=ear, p=pink, t=tip: t if ny > 0.8 else (p if nz > 0.35 and abs(nx) < 0.7 else e), segs=10, rings=7, rot=(-0.35, 0, sx * -0.2))
    # the eyes, the nose, the cotton tail
    for sx in (-1, 1):
        ellipsoid(C, (sx * 0.055, 0.27, 0.165), (0.016, 0.02, 0.012), lin("#1B1411"), segs=8, rings=5)
    ellipsoid(C, (0, 0.245, 0.19), (0.014, 0.01, 0.01), lin("#D98A8A"), segs=6, rings=4)
    ellipsoid(C, (0, 0.14, -0.175), (0.045, 0.045, 0.04), lin("#FBF7F0"), segs=8, rings=6)


def squirrel(C):
    fur, belly, dark = "#B4582A", "#F3E1C6", "#7E3A1A"
    # on its haunches: the body tilted up, the belly pale
    ellipsoid(C, (0, 0.1, 0.0), (0.058, 0.08, 0.075), shaded(fur, belly, 0.1), rot=(-0.45, 0, 0))
    for sx in (-1, 1):
        ellipsoid(C, (sx * 0.04, 0.05, -0.02), (0.035, 0.045, 0.055), lin(fur), segs=8, rings=6)
        ellipsoid(C, (sx * 0.035, 0.012, 0.03), (0.018, 0.012, 0.035), lin(dark), segs=6, rings=4)
        # the forepaws held up at the chest (a nut between them)
        ellipsoid(C, (sx * 0.022, 0.13, 0.075), (0.014, 0.022, 0.014), lin(fur), segs=6, rings=4)
    ellipsoid(C, (0, 0.13, 0.092), (0.018, 0.018, 0.018), lin("#8A5A2A"), segs=8, rings=5)
    # the head, the tufted ears
    ellipsoid(C, (0, 0.2, 0.06), (0.05, 0.048, 0.055), shaded(fur, belly, -0.4))
    for sx in (-1, 1):
        ellipsoid(C, (sx * 0.03, 0.255, 0.045), (0.012, 0.03, 0.008), lin(dark), segs=6, rings=5, rot=(0, 0, sx * -0.3))
        ellipsoid(C, (sx * 0.032, 0.21, 0.1), (0.011, 0.013, 0.008), lin("#1B1411"), segs=6, rings=4)
    ellipsoid(C, (0, 0.19, 0.113), (0.009, 0.007, 0.007), lin("#3A2418"), segs=6, rings=4)
    # the tail: a bushy S up over its back, lighter at the tip
    pts = [(0, 0.05, -0.07), (0, 0.09, -0.12), (0, 0.15, -0.15), (0, 0.22, -0.15), (0, 0.28, -0.12), (0, 0.31, -0.07), (0, 0.3, -0.03)]
    for k, p in enumerate(pts):
        r = 0.036 + 0.028 * math.sin(math.pi * min(1.0, (k + 1) / len(pts)))
        tone = mix(lin(fur), lin("#E8B070"), max(0, k - 4) / 2)
        ellipsoid(C, p, (r * 0.85, r, r), lambda nx, ny, nz, t=tone: mix(t, lin(dark), max(0.0, -nz) * 0.5), segs=9, rings=6)


def deer(C):
    coat, belly, dark = "#A96F3E", "#F2E4CE", "#5A3A22"
    spots = lin("#F6EAD2")

    def dappled(nx, ny, nz):
        base = mix(lin(coat), lin(belly), (-0.2 - ny) / 0.4)
        # a fawn's dapples along the back
        if ny > 0.35 and abs(nx) > 0.25 and hash01(round(nz * 6), round(nx * 3) + round(ny * 4)) < 0.35:
            return spots
        return base

    # the barrel, the chest and the rump (chibi: a short, round body on sturdy little legs)
    ellipsoid(C, (0, 0.5, 0.0), (0.16, 0.16, 0.3), dappled, segs=14, rings=9)
    ellipsoid(C, (0, 0.52, 0.19), (0.15, 0.17, 0.13), shaded(coat, belly), segs=12, rings=8)
    ellipsoid(C, (0, 0.53, -0.21), (0.15, 0.15, 0.12), shaded(coat, belly), segs=12, rings=8)
    # the legs, dark hooves
    for sx in (-1, 1):
        for sz, top in ((0.19, 0.44), (-0.21, 0.46)):
            limb(C, (sx * 0.09, top, sz), (sx * 0.085, 0.0, sz + 0.01), 0.055, 0.032, lin(coat), segs=8, col_end=lin("#2A1E16"))
    # the neck up to the head, the pale throat
    limb(C, (0, 0.58, 0.25), (0, 0.84, 0.38), 0.085, 0.07, lin(coat), segs=10)
    ellipsoid(C, (0, 0.68, 0.33), (0.055, 0.09, 0.045), lin(belly), segs=8, rings=6, rot=(0.5, 0, 0))
    # the head (big, for the chibi look), the muzzle, the black nose and the eyes
    ellipsoid(C, (0, 0.92, 0.43), (0.105, 0.105, 0.12), shaded(coat, belly, -0.4), rot=(0.2, 0, 0))
    ellipsoid(C, (0, 0.875, 0.55), (0.058, 0.055, 0.07), shaded(dark, belly, -0.3), segs=10, rings=6)
    ellipsoid(C, (0, 0.89, 0.615), (0.026, 0.02, 0.014), lin("#141010"), segs=6, rings=4)
    for sx in (-1, 1):
        ellipsoid(C, (sx * 0.075, 0.945, 0.5), (0.02, 0.026, 0.018), lin("#141010"), segs=6, rings=4)
        # the ears, wide and alert, pale inside
        ellipsoid(C, (sx * 0.12, 1.02, 0.38), (0.07, 0.035, 0.024), lambda nx, ny, nz: lin("#EBD2B8") if nz > 0.3 else lin(coat), segs=10, rings=6, rot=(0, 0, sx * 0.45))
    # the short white tail
    ellipsoid(C, (0, 0.6, -0.32), (0.045, 0.055, 0.035), lin("#FBF7F0"), segs=8, rings=6, rot=(0.4, 0, 0))


LOOKS = {"Rabbit": rabbit, "Squirrel": squirrel, "Deer": deer}


def build_critter(name, make, coll):
    C = Critter()
    make(C)
    bm = C.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    for f in bm.faces:
        for loop in f.loops:
            loop[col] = loop.vert[C.vc]
    bm.verts.layers.float_color.remove(C.vc)
    me = bpy.data.meshes.new(f"Critter_{name}Mesh")
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
    ob = bpy.data.objects.new(f"Critter_{name}", me)
    coll.objects.link(ob)
    return ob


def build():
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    for name, make in LOOKS.items():
        build_critter(name, make, coll)
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


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll = build()
        out = os.path.join(root, "client", "public", "models", "critters.glb")
        export(coll, out)
        tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in coll.all_objects if o.data}
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "tris": tris}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
