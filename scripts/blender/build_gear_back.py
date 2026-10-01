"""The gear's back pieces: builds client/public/models/gear_back.glb.

Run it inside Blender (through the Live Bridge, in a namespace of its own with REPO_ROOT and
REPORT_PATH set, or headless: blender -b --factory-startup -P scripts/blender/build_gear_back.py).
It stands alone (no other builder's kit, no master file): four small props, a few hundred faces each.

    Back_ang_creel   the Angler's Creel Pack: a woven willow creel with its lid, a fish's tail out of
                     it and a red-and-white float hung at its side
    Back_for_frame   the Forester's Timber Frame: a wooden pack frame with three logs lashed across it
    Back_pro_lamp    the Prospector's Lamp Pack: a canvas pack with a bedroll on top and a brass
                     lantern hung at its side (its flame its own glowing material, GB_Glow)
    Back_way_pack    the Wayfarer's Explorer's Pack: a leather rucksack with a rolled blanket, side
                     pockets, a tin cup and a map scroll

Each is modelled where it rides on the avatar (shared/gear.ts: the back slot), in the avatar's own
space, with its origin at the Torso's pivot: the game hangs it on the avatar's Torso node at (0, 0, 0)
(client/src/entities/Avatar.tsx AvatarBack), so it breathes with the trunk. The avatar's bare trunk
reaches 0.15 behind its middle and its thickest tops about 0.2 (a hood more); the head overhangs the
back above 0.6: a pack sits from 0.17 back, between 0.22 and 0.6 up, within 0.17 either side.

Every colour is a vertex colour ("Col") over one clay material, GB_Clay (and GB_Glow: the lantern's
flame), as on the keepers' models.

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y): the avatar faces -y here, its back is +y.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION = "GearBack"
TORSO_PIVOT = Vector((0.0, 0.0, 0.17))
# where a pack's front face rides (just clear of an everyday top's back)
BACK_Y = 0.175


def lin(hex_color):
    """sRGB hex to linear RGB."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


class Mesh:
    """A bmesh being built, each face with its colour (and whether it glows)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new("Col")
        self.glow = set()

    def paint(self, faces, colour, glow=False):
        rgb = (*lin(colour), 1.0)
        for f in faces:
            f.smooth = True
            for loop in f.loops:
                loop[self.col] = rgb
            if glow:
                self.glow.add(f.index)

    def blob(self, centre, half, colour, n=2.0, segs=14, rings=8, rot=None, glow=False):
        """A superellipsoid: n = 2 an ellipsoid, n = 5 and more a box with rounded corners."""
        c = Vector(centre)
        e = 2.0 / n
        sp = lambda v: math.copysign(abs(v) ** e, v)
        grid = []
        for i in range(rings + 1):
            lat = -math.pi / 2 + math.pi * i / rings
            row = []
            for j in range(segs):
                lon = 2 * math.pi * j / segs
                p = Vector((half[0] * sp(math.cos(lat)) * sp(math.cos(lon)), half[1] * sp(math.cos(lat)) * sp(math.sin(lon)), half[2] * sp(math.sin(lat))))
                if rot is not None:
                    p = rot @ p
                row.append(self.bm.verts.new(c + p))
            grid.append(row)
        faces = []
        for i in range(rings):
            for j in range(segs):
                a, b, cc, d = grid[i][j], grid[i][(j + 1) % segs], grid[i + 1][(j + 1) % segs], grid[i + 1][j]
                vs = [a, b, cc, d]
                # (the poles' rows collapse to a point: drop the doubled corners)
                uniq = []
                for v in vs:
                    if all((v.co - u.co).length > 1e-7 for u in uniq):
                        uniq.append(v)
                if len(uniq) >= 3:
                    try:
                        faces.append(self.bm.faces.new(uniq))
                    except ValueError:
                        pass
        self.bm.faces.index_update()
        self.paint(faces, colour, glow)
        return faces

    def rod(self, p0, p1, radius, colour, segs=10, r1=None, end=None):
        """A cylinder from p0 to p1 (radius `r1` at p1 when given), its two ends capped flat (`end`:
        the caps' colour, a log's pale cut wood)."""
        a, b = Vector(p0), Vector(p1)
        axis = (b - a).normalized()
        side = axis.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = axis.cross(Vector((1, 0, 0)))
        side.normalize()
        up = axis.cross(side)
        ring = lambda p, r: [self.bm.verts.new(p + (side * math.cos(2 * math.pi * k / segs) + up * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)]
        ra, rb = ring(a, radius), ring(b, radius if r1 is None else r1)
        sides = [self.bm.faces.new([ra[k], ra[(k + 1) % segs], rb[(k + 1) % segs], rb[k]]) for k in range(segs)]
        # (the caps on rings of their own: a crisp edge under smooth shading)
        ca, cb = ring(a, radius), ring(b, radius if r1 is None else r1)
        caps = [self.bm.faces.new(list(reversed(ca))), self.bm.faces.new(cb)]
        self.bm.faces.index_update()
        self.paint(sides, colour)
        self.paint(caps, end or colour)
        for f in caps:
            f.smooth = False
        return sides + caps

    def strap(self, points, width, thick, colour):
        """A flat strap along `points` (its width across x)."""
        out = []
        for a, b in zip(points, points[1:]):
            mid = (Vector(a) + Vector(b)) / 2
            d = Vector(b) - Vector(a)
            rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
            out += self.blob(mid, (width / 2, thick / 2, d.length / 2 + thick / 2), colour, n=6.0, segs=8, rings=4, rot=rot)
        return out


def material(name, glow=False):
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
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0
    if glow:
        links.new(attr.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.6
    m.use_backface_culling = True
    return m


def make_object(name, M, coll):
    bm = M.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    glow = set(M.glow)
    me = bpy.data.meshes.new(name)
    # (the origin at the Torso's pivot)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=-TORSO_PIVOT)
    for f in bm.faces:
        f.material_index = 1 if f.index in glow else 0
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material("GB_Clay"))
    me.materials.append(material("GB_Glow", glow=True))
    attr = me.color_attributes.get("Col")
    if attr:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    ob.location = TORSO_PIVOT
    coll.objects.link(ob)
    return ob


def rx(deg):
    return Matrix.Rotation(math.radians(deg), 3, "X")


def ry(deg):
    return Matrix.Rotation(math.radians(deg), 3, "Y")


def rz(deg):
    return Matrix.Rotation(math.radians(deg), 3, "Z")


def shoulder_loops(M, colour, half_x=0.085, top=0.585, y_out=None):
    """The two straps over the shoulders: from the pack's top forward over each shoulder, ending on
    the trunk's top (they vanish into whatever top is worn)."""
    y1 = BACK_Y + 0.02 if y_out is None else y_out
    for s in (-1, 1):
        M.strap([(s * half_x, y1, top - 0.05), (s * half_x, 0.09, top + 0.045), (s * half_x, -0.02, top + 0.03)], 0.034, 0.012, colour)


def creel_pack():
    """A woven willow creel: a barrel of a basket, banded, its lid a little open with a fish's tail
    out of it; a red-and-white float hung at its side."""
    M = Mesh()
    wicker, band, leather = "#C9A56A", "#A07C45", "#6E4A2C"
    cy = BACK_Y + 0.085
    M.blob((0, cy, 0.39), (0.135, 0.085, 0.135), wicker, n=3.2, segs=18, rings=10)
    for z in (0.31, 0.39, 0.47):
        M.blob((0, cy, z), (0.139, 0.089, 0.012), band, n=3.2, segs=18, rings=4)
    # the lid, tipped back a little, and its peg
    M.blob((0, cy + 0.004, 0.535), (0.13, 0.082, 0.022), band, n=3.0, segs=18, rings=6, rot=rx(-8))
    M.blob((0, cy + 0.092, 0.5), (0.014, 0.012, 0.022), leather)
    # a fish's tail out from under the lid (silver-blue), on the left
    tail = rz(18) @ rx(-20)
    M.blob((-0.06, cy + 0.02, 0.575), (0.012, 0.026, 0.045), "#8FB7C9", rot=tail)
    M.blob((-0.066, cy + 0.03, 0.628), (0.008, 0.05, 0.03), "#6E9DB3", n=1.6, rot=tail)
    # the float on its line, at the right side
    M.rod((0.142, cy, 0.5), (0.158, cy + 0.01, 0.4), 0.0035, "#EDE6D6", segs=6)
    M.blob((0.16, cy + 0.012, 0.375), (0.026, 0.026, 0.028), "#E0524A")
    M.blob((0.16, cy + 0.012, 0.392), (0.0265, 0.0265, 0.013), "#F7F3EA")
    M.rod((0.16, cy + 0.012, 0.345), (0.16, cy + 0.012, 0.32), 0.004, "#3A3A40", segs=6)
    shoulder_loops(M, leather)
    return M


def timber_frame():
    """A wooden pack frame (two uprights, three slats) with three logs lashed across it."""
    M = Mesh()
    frame, bark, cut, rope = "#9A6B3F", "#6B4A30", "#E3C79A", "#D9C7A0"
    y0 = BACK_Y + 0.018
    for s in (-1, 1):
        M.blob((s * 0.1, y0, 0.41), (0.017, 0.016, 0.2), frame, n=5.0, segs=8, rings=6)
    for z in (0.26, 0.41, 0.56):
        M.blob((0, y0 + 0.004, z), (0.115, 0.012, 0.018), frame, n=5.0, segs=8, rings=4)
    # the shelf the bottom log rests on
    M.blob((0, y0 + 0.06, 0.245), (0.105, 0.06, 0.012), frame, n=5.0, segs=8, rings=4)
    logs = [((0, y0 + 0.075, 0.31), 0.055, 0.2), ((0.008, y0 + 0.08, 0.42), 0.05, 0.19), ((-0.006, y0 + 0.07, 0.515), 0.042, 0.175)]
    for (x, y, z), r, half in logs:
        M.rod((x - half, y, z), (x + half, y, z), r, bark, segs=12, end=cut)
        # (the heartwood's ring on each cut end)
        for s in (-1, 1):
            M.rod((x + s * (half + 0.001), y, z), (x + s * (half + 0.003), y, z), r * 0.45, "#C9A56A", segs=10)
    # the lashings round the stack
    for x in (-0.085, 0.085):
        M.strap([(x, y0 - 0.004, 0.25), (x, y0 + 0.15, 0.3), (x, y0 + 0.15, 0.5), (x, y0 - 0.004, 0.57)], 0.016, 0.008, rope)
    shoulder_loops(M, "#5E4A33", half_x=0.1, top=0.59, y_out=y0)
    return M


def lamp_pack():
    """A canvas pack with a bedroll on top and a brass lantern hung at its side, its flame glowing."""
    M = Mesh()
    canvas, flap, leather, brass, blanket = "#7C8466", "#666E52", "#5E4630", "#C9A14A", "#8E3B32"
    cy = BACK_Y + 0.075
    M.blob((0, cy, 0.375), (0.13, 0.075, 0.135), canvas, n=3.6, segs=16, rings=10)
    # the flap and its two buckled straps
    M.blob((0, cy + 0.012, 0.455), (0.132, 0.078, 0.06), flap, n=3.4, segs=16, rings=8)
    for x in (-0.055, 0.055):
        M.strap([(x, cy + 0.08, 0.47), (x, cy + 0.084, 0.33)], 0.022, 0.008, leather)
        M.blob((x, cy + 0.088, 0.385), (0.016, 0.006, 0.013), brass, n=4.0, segs=8, rings=4)
    # the bedroll across the top, strapped
    M.rod((-0.15, cy, 0.545), (0.15, cy, 0.545), 0.045, blanket, segs=12, end="#B5564A")
    for x in (-0.08, 0.08):
        M.blob((x, cy, 0.545), (0.012, 0.048, 0.048), leather, n=2.6, segs=12, rings=6)
    # the lantern on a hook at the left side: a cap, the glass with its flame, a base, a bail
    lx, ly = -0.165, cy + 0.01
    M.rod((-0.128, ly, 0.47), (lx, ly, 0.47), 0.005, brass, segs=6)
    M.rod((lx, ly, 0.47), (lx, ly, 0.44), 0.004, brass, segs=6)
    M.blob((lx, ly, 0.428), (0.03, 0.03, 0.014), brass, n=2.4)
    M.blob((lx, ly, 0.385), (0.026, 0.026, 0.036), "#FFE9A8", n=2.6, glow=True)
    M.blob((lx, ly, 0.342), (0.031, 0.031, 0.012), brass, n=2.4)
    for a in (45, 135, 225, 315):
        dx, dy = 0.027 * math.cos(math.radians(a)), 0.027 * math.sin(math.radians(a))
        M.rod((lx + dx, ly + dy, 0.345), (lx + dx, ly + dy, 0.425), 0.0035, brass, segs=5)
    shoulder_loops(M, leather)
    return M


def explorer_pack():
    """A leather rucksack: a rolled blanket on top, two side pockets, a tin cup and a map scroll."""
    M = Mesh()
    leather, dark, blanket, tin, paper = "#A0623A", "#74442A", "#3F7F86", "#B9C0C6", "#EFE4C4"
    cy = BACK_Y + 0.08
    M.blob((0, cy, 0.385), (0.135, 0.08, 0.15), leather, n=3.4, segs=16, rings=10)
    M.blob((0, cy + 0.014, 0.475), (0.137, 0.082, 0.065), dark, n=3.2, segs=16, rings=8)
    # the front pocket and its clasp
    M.blob((0, cy + 0.075, 0.33), (0.085, 0.022, 0.06), dark, n=3.6, segs=12, rings=6)
    M.blob((0, cy + 0.1, 0.35), (0.014, 0.006, 0.012), "#D9B25C", n=4.0, segs=8, rings=4)
    # the side pockets
    for s in (-1, 1):
        M.blob((s * 0.135, cy, 0.32), (0.028, 0.05, 0.062), dark, n=3.2, segs=10, rings=6)
    # the rolled blanket on top, strapped
    M.rod((-0.155, cy, 0.565), (0.155, cy, 0.565), 0.043, blanket, segs=12, end="#5FA5AB")
    for x in (-0.085, 0.085):
        M.blob((x, cy, 0.565), (0.012, 0.046, 0.046), dark, n=2.6, segs=12, rings=6)
    # a map scroll in the right side pocket, a tin cup hung at the left
    M.rod((0.137, cy, 0.34), (0.15, cy + 0.01, 0.5), 0.016, paper, segs=8, end="#D9C7A0")
    M.rod((-0.165, cy + 0.02, 0.395), (-0.165, cy + 0.02, 0.345), 0.026, tin, segs=10, r1=0.022)
    M.rod((-0.137, cy + 0.02, 0.4), (-0.165, cy + 0.02, 0.4), 0.004, dark, segs=5)
    shoulder_loops(M, dark)
    return M


PIECES = (("Back_ang_creel", creel_pack), ("Back_for_frame", timber_frame), ("Back_pro_lamp", lamp_pack), ("Back_way_pack", explorer_pack))


def build():
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    for name, make in PIECES:
        make_object(name, make(), coll)
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
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        out[o.name] = {
            "tris": sum(len(p.vertices) - 2 for p in o.data.polygons),
            "min": [round(min(w[i] for w in ws), 3) for i in range(3)],
            "max": [round(max(w[i] for w in ws), 3) for i in range(3)],
        }
    return out


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    return os.path.normpath(os.path.join(here, "..", ".."))


def main():
    report = globals().get("REPORT_PATH") or os.environ.get("GEAR_BACK_REPORT")
    try:
        root = repo_root()
        coll = build()
        out = os.path.join(root, "client", "public", "models", "gear_back.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print("GEAR_BACK " + json.dumps(result))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
