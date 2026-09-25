"""Mochi the cat: builds client/public/models/cat.glb.

Run it inside Blender, either through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_cat.py

or headless:

    blender -b -P scripts/blender/build_cat.py

When the body is POSTed there is no `__file__`, so the export path falls back to the
COZYCUBE_ROOT environment variable, then Blender's working directory. Define `REPO_ROOT` (and
optionally `REPORT_PATH`, where a JSON summary or the traceback is written) in front of the body
to point it somewhere explicitly.

Coordinates are Blender's: Z up, the cat faces -Y, her left is +X. The glTF exporter turns them
into three.js's (Y up, facing +Z). Every object keeps a zero rotation, and every part's shape is
baked into its mesh around its pivot, so the runtime's rotations are about clean local axes at the
joint. The node names are the contract in client/src/entities/rig.ts (MOCHI_NODES).

Her form, front to back: a round head, one soft monolithic shape whose lower half is gently
fuller (a chubby taper), with a little muzzle and a round chin, on a short neck slope above her
chest, cupped ears with rounded tips and a soft 0.012 rim angled out and a little forward, two cream half-dome
paws tucked under the chest, and a plump pear of a body, narrow at the chest and round at the
haunches, with shoulder blades and haunches under the fur and a gentle arc along the spine. The tail curls from the rump round
her right flank along the floor, tapering to 65% of its root.

Two-tone coat: Mat_Ginger everywhere, Mat_Cream on the paws, a chest bib and the muzzle. The bib
and the muzzle are cut into their meshes along a plane, so each boundary is a clean curve on the
surface, not a stair-step of faces. The face (closed happy eyes, a :3 mouth, a nose, blush) and
the inner ears are painted-on decals: thin sheets whose every vertex is projected onto the
surface under it and lifted 0.002-0.0025 along its normal. They follow the curvature exactly,
stand no thicker than paint in side profile, and are never coplanar with it, so they cannot
z-fight.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

COLLECTION = "Mochi"
NODE_NAMES = ("Body", "Loaf", "Head", "Face", "EarL", "EarR", "PawL", "PawR", "Tail", "Yawn", "Tongue")

# sRGB hex, converted to linear for Blender
PALETTE = {
    "Mat_Ginger": "#E67E22",
    "Mat_Cream": "#FFFDF9",
    "Mat_Nose": "#FF7675",
    "Mat_Chocolate": "#4A2A1F",
    "Mat_Blush": "#F7A8B0",
    "Mat_Tabby": "#9A5530",
    "Mat_Mouth": "#7A2F3A",
    "Mat_Tongue": "#F58C9A",
}
ROUGHNESS = 0.75
DECAL_LIFT = 0.0022
NOSE_LIFT = 0.0025


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    return Vector([_lin(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5)])


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def soft_floor(z, k):
    """A smooth max(z, 0): flat at the floor, with a rounded crease where the body meets it."""
    x = z / k
    return k * (x + math.log1p(math.exp(-x))) if x > 0 else k * math.log1p(math.exp(x))


def gauss(d, centre, width):
    return math.exp(-((d - centre).length_squared) / width)


def tangents_of(d):
    """Two unit vectors perpendicular to d (and to each other)."""
    a = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    e1 = d.cross(a).normalized()
    return e1, d.cross(e1).normalized()


# ---------------------------------------------------------------------------------------------
# mesh builders


def quad_sphere(cuts):
    """A cube subdivided into a quad grid; each vertex's direction is the sphere it becomes."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    return bm


def superellipsoid(d, n):
    """Where direction d meets |x|^n + |y|^n + |z|^n = 1: n = 2 is a sphere, larger n a softly
    squared box. Smooth everywhere, so it never shows a crease."""
    return d / (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)


def shaped(cuts, shape):
    """A quad sphere whose every vertex is moved to shape(direction)."""
    bm = quad_sphere(cuts)
    for v in bm.verts:
        v.co = shape(v.co.normalized())
    return bm


def paint_by_plane(bm, co, no, material):
    """Cut the mesh along a plane and give every face on its `no` side `material`."""
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, dist=1e-7)
    for f in bm.faces:
        if (f.calc_center_median() - co).dot(no) > 0:
            f.material_index = material


def paint_by_field(bm, field, material, reproject):
    """Cut the mesh along the zero contour of `field(point)` and give every face where it is
    positive `material`. Each crossing edge is split where the field crosses zero, the new vertex
    is pulled back onto the surface (`reproject`), and the faces are split between them, so the
    boundary is a clean curve on the surface however it winds."""
    vals = {v: field(v.co) for v in bm.verts}
    crossing = [e for e in bm.edges if (vals[e.verts[0]] > 0) != (vals[e.verts[1]] > 0)]
    cut = set()
    for e in crossing:
        a, b = e.verts
        at = a.co.lerp(b.co, vals[a] / (vals[a] - vals[b]))
        _, v = bmesh.utils.edge_split(e, a, 0.5)
        v.co = reproject(at)  # placed explicitly: the split's own factor only picks the edge
        cut.add(v)
    for f in list(bm.faces):
        on = [v for v in f.verts if v in cut]
        if len(on) == 2:
            bmesh.utils.face_split(f, on[0], on[1])
    for f in bm.faces:
        if field(f.calc_center_median()) > 0:
            f.material_index = material


def smax(values, k):
    """A smooth maximum: unions soft shapes without a crease where they meet."""
    return k * math.log(sum(math.exp(v / k) for v in values))


def orient(faces, expected):
    """Point every face of an open sheet along `expected(face)` (a sheet has no inside to recalc from)."""
    for f in faces:
        f.normal_update()
        if f.normal.dot(expected(f)) < 0:
            f.normal_flip()


def catmull_rom(points, steps):
    pts = [points[0]] + points + [points[-1]]
    out = []
    for i in range(len(points) - 1):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for j in range(steps):
            t = j / steps
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t))
    out.append(points[-1].copy())
    return out


def arc_lengths(path):
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    return lengths


def tube(bm, path, radius, sides=16, cap_rings=5, material=0):
    """Sweep a circle along `path` (radius(s), s = 0..1 of its length) with round caps at both ends."""
    lengths = arc_lengths(path)
    total = lengths[-1]
    tangents = [(path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized() for i in range(len(path))]
    # parallel-transported frames, so the rings never twist
    up = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normal = (up - tangents[0] * up.dot(tangents[0])).normalized()
    frames = []
    for t in tangents:
        normal = (normal - t * normal.dot(t)).normalized()
        frames.append((normal.copy(), t.cross(normal)))

    def ring_at(centre, n, b, r):
        return [centre + (n * math.cos(a) + b * math.sin(a)) * r for a in (2 * math.pi * k / sides for k in range(sides))]

    rings = []
    t0, n0, b0 = tangents[0], *frames[0]
    r0 = radius(0.0)
    for j in range(cap_rings, 0, -1):
        phi = j / (cap_rings + 1) * (math.pi / 2)
        rings.append(ring_at(path[0] - t0 * r0 * math.sin(phi), n0, b0, r0 * math.cos(phi)))
    for i, p in enumerate(path):
        rings.append(ring_at(p, *frames[i], radius(lengths[i] / total)))
    t1, n1, b1 = tangents[-1], *frames[-1]
    r1 = radius(1.0)
    for j in range(1, cap_rings + 1):
        phi = j / (cap_rings + 1) * (math.pi / 2)
        rings.append(ring_at(path[-1] + t1 * r1 * math.sin(phi), n1, b1, r1 * math.cos(phi)))

    start = bm.verts.new(path[0] - t0 * r0)
    end = bm.verts.new(path[-1] + t1 * r1)
    vrings = [[bm.verts.new(co) for co in pts] for pts in rings]
    faces = []
    for k in range(sides):
        faces.append(bm.faces.new((start, vrings[0][(k + 1) % sides], vrings[0][k])))
        faces.append(bm.faces.new((end, vrings[-1][k], vrings[-1][(k + 1) % sides])))
    for ra, rb in zip(vrings, vrings[1:]):
        for k in range(sides):
            faces.append(bm.faces.new((ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k])))
    for f in faces:
        f.material_index = material


def patch(bm, surf, a0, b0, ra, rb, outline=lambda th: 1.0, lift=DECAL_LIFT, material=0, rings=6, segs=32):
    """A painted spot: a disc in the (a, b) parameters of `surf` (a, b -> surface point, normal),
    each vertex on the surface and lifted `lift` along its normal. `outline(angle)` shapes the rim."""
    normals = {}

    def vert(r, th):
        k = outline(th) * r
        p, n = surf(a0 + ra * k * math.cos(th), b0 + rb * k * math.sin(th))
        v = bm.verts.new(p + n * lift)
        normals[v] = n
        return v

    centre = vert(0.0, 0.0)
    rows = [[vert(i / rings, 2 * math.pi * j / segs) for j in range(segs)] for i in range(1, rings + 1)]
    faces = [bm.faces.new((centre, rows[0][j], rows[0][(j + 1) % segs])) for j in range(segs)]
    for inner, outer in zip(rows, rows[1:]):
        for j in range(segs):
            faces.append(bm.faces.new((inner[j], outer[j], outer[(j + 1) % segs], inner[(j + 1) % segs])))
    for f in faces:
        f.material_index = material
    orient(faces, lambda f: sum((normals[v] for v in f.verts), Vector()))


def stroke(bm, path, width, project, lift=DECAL_LIFT, material=0, across=4, taper=0.0):
    """A painted line: a ribbon `width` wide along `path` (points on the surface), every vertex
    projected back onto the surface (project(q) -> point, normal) and lifted `lift`. Round ends;
    `taper` narrows it toward the end (0.5: half as wide)."""
    lengths = arc_lengths(path)
    total = lengths[-1]
    normals = {}

    def vert(q):
        p, n = project(q)
        v = bm.verts.new(p + n * lift)
        normals[v] = n
        return v

    rows = []
    for i, p in enumerate(path):
        _, n = project(p)
        t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        side = n.cross(t).normalized()
        to_end = min(lengths[i], total - lengths[i])
        w = width * (1 - taper * lengths[i] / total)
        env = math.sqrt(max(0.0, 1 - (1 - min(1.0, to_end / (w / 2))) ** 2))
        if env < 1e-3:
            rows.append([vert(p)])
        else:
            rows.append([vert(p + side * (w / 2) * env * (2 * k / across - 1)) for k in range(across + 1)])
    faces = []
    for a, b in zip(rows, rows[1:]):
        if len(a) == 1:
            faces += [bm.faces.new((a[0], b[k], b[k + 1])) for k in range(len(b) - 1)]
        elif len(b) == 1:
            faces += [bm.faces.new((a[k], b[0], a[k + 1])) for k in range(len(a) - 1)]
        else:
            faces += [bm.faces.new((a[k], b[k], b[k + 1], a[k + 1])) for k in range(len(a) - 1)]
    for f in faces:
        f.material_index = material
    orient(faces, lambda f: sum((normals[v] for v in f.verts), Vector()))


# ---------------------------------------------------------------------------------------------
# scene plumbing


def purge():
    """Remove the previous build: the Mochi collection and everything in it (nothing else is touched)."""
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass  # Blender 5: materials always have a node tree
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = lin(PALETTE[name])
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = ROUGHNESS
    bsdf.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = (*c, 1)
    m.roughness = ROUGHNESS
    m.use_backface_culling = True  # exports single-sided: every mesh is closed or a decal facing out
    return m


def make_object(name, bm, origin, collection, parent=None, parent_origin=Vector(), mats=(), closed=True):
    """Turn a bmesh built in world coordinates into an object whose origin (pivot) is `origin`.
    Closed meshes get their normals recalculated; ones carrying decal sheets keep the winding
    they were built with."""
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=-origin)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    ob.location = origin - parent_origin
    if parent:
        ob.parent = parent
    return ob


# ---------------------------------------------------------------------------------------------
# anatomy: every number is in metres of the diorama (the whole cat is about 0.67 long)

# The body: a plump pear, round haunches tapering to the chest, flat on the floor. Soft
# contours under the fur: two shoulder blades behind the head, two haunches over the hips, and a
# dip at the withers so the head sits on a neck slope instead of running into a loaf.
LOAF_CENTRE = Vector((0, 0.035, 0.135))
LOAF_HALF = Vector((0.188, 0.222, 0.16))
LOAF_FLOOR_K = 0.014
CHEST_DIR = Vector((0, -0.95, 0.3)).normalized()
SHOULDER_DIRS = [Vector((s * 0.5, -0.45, 0.74)).normalized() for s in (-1, 1)]
HAUNCH_DIRS = [Vector((s * 0.78, 0.55, 0.05)).normalized() for s in (-1, 1)]
WITHERS_DIR = Vector((0, -0.62, 0.78)).normalized()


def loaf_shape(d):
    chest = smoothstep(-1.0, 1.0, -d.y)  # 0 at the rump, 1 at the chest
    q = superellipsoid(d, 2.2 + 0.6 * chest)  # a round rump, a fuller chest
    p = Vector((q.x * LOAF_HALF.x, q.y * LOAF_HALF.y, q.z * LOAF_HALF.z))
    p.x *= (1 - 0.3 * chest**1.5) * (1 + 0.08 * smoothstep(0.5, -0.9, d.z))  # pear, and a settled belly
    if p.z > 0:
        p.z *= 1 + 0.07 * math.sin(math.pi * (1 - chest)) - 0.04 * chest  # the spine's arc, easing down to the chest
    p.y -= 0.05 * gauss(d, CHEST_DIR, 0.16)  # the upper chest swells forward to cradle the chin
    p += d * (
        sum(0.014 * gauss(d, c, 0.05) for c in SHOULDER_DIRS)
        + sum(0.016 * gauss(d, c, 0.12) for c in HAUNCH_DIRS)
        - 0.02 * gauss(d, WITHERS_DIR, 0.05)
    )
    w = LOAF_CENTRE + p
    # flatten her belly onto the floor; the lowest point lands exactly on z = 0
    w.z = soft_floor(w.z, LOAF_FLOOR_K) - soft_floor(LOAF_CENTRE.z - LOAF_HALF.z, LOAF_FLOOR_K)
    return w


# The head sits on a short neck slope above the chest; its pivot is the neck base, inside the
# body. One monolithic form: a softly squared sphere with a little muzzle, a round chin that
# curves down toward the chest and a small nape, its lower half eased out sideways (up to
# CHUBBY_TAPER) so the face reads chubby without anything stuck onto it.
HEAD_CENTRE = Vector((0, -0.165, 0.255))
HEAD_HALF = Vector((0.17, 0.138, 0.134))
NECK = Vector((0, -0.09, 0.16))
CHUBBY_TAPER = 1.08
MUZZLE_DIR = Vector((0, -0.93, -0.36)).normalized()
CHIN_DIR = Vector((0, -0.5, -0.87)).normalized()
NAPE_DIR = Vector((0, 0.78, -0.62)).normalized()


def head_offset(d):
    q = superellipsoid(d, 2.35)
    p = Vector((q.x * HEAD_HALF.x, q.y * HEAD_HALF.y, q.z * HEAD_HALF.z))
    p.x *= 1 + (CHUBBY_TAPER - 1) * smoothstep(0.25, -0.55, d.z)
    push = 0.018 * gauss(d, MUZZLE_DIR, 0.05) + 0.032 * gauss(d, CHIN_DIR, 0.18) + 0.04 * gauss(d, NAPE_DIR, 0.3)
    return p + d * push


def head_point(d):
    return HEAD_CENTRE + head_offset(d)


def head_normal(d, e=1e-3):
    p = head_point(d)
    e1, e2 = tangents_of(d)
    n = (head_point((d + e1 * e).normalized()) - p).cross(head_point((d + e2 * e).normalized()) - p).normalized()
    return -n if n.dot(p - HEAD_CENTRE) < 0 else n


def head_dir(yaw, pitch):
    """A direction from the head's centre: yaw + to her left (+X), pitch + up; 0, 0 is her nose."""
    return Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))


def head_surf(yaw, pitch):
    d = head_dir(yaw, pitch)
    return head_point(d), head_normal(d)


def head_param(q):
    """The direction d whose head_point(d) lies under q, seen from the head's centre. head_point
    is not radial (the skull is wider than it is deep), so this is found by a few fixed-point steps."""
    target = (q - HEAD_CENTRE).normalized()
    d = target.copy()
    for _ in range(8):
        d = (d + target - (head_point(d) - HEAD_CENTRE).normalized()).normalized()
    return d


def head_project(q):
    """The skull's surface under a point near it, and its normal there."""
    d = head_param(q)
    return head_point(d), head_normal(d)


def muzzle_mask(q):
    """> 0 on the cream mask: one smooth rounded patch wrapping the :3 mouth (the nose sits at its
    top edge), widening a little over the whisker pads and carrying on down the chin to the
    throat. A single soft shape, so its outline is one clean curve with no notches."""
    d = head_param(q)  # the same yaw / pitch the eyes, nose and blush are placed in
    yaw, pitch = math.atan2(d.x, -d.y), math.asin(max(-1.0, min(1.0, d.z)))
    if abs(yaw) > 1.6:
        return -1.0
    half_width = 0.4 + 0.08 * math.exp(-(((pitch + 0.3) / 0.12) ** 2))  # a touch wider over the pads
    face = 1 - (yaw / half_width) ** 2 - ((pitch + 0.42) / 0.3) ** 2
    throat = min((-pitch - 0.62) / 0.2, 1 - (yaw / 0.7) ** 2)
    return smax([face, throat], 0.25)


def face_arc(centre_yaw, centre_pitch, arc_from, arc_to, rw, rh, steps=48):
    """Points on the skull along an arc drawn in yaw/pitch."""
    pts = []
    for i in range(steps + 1):
        a = arc_from + (arc_to - arc_from) * i / steps
        pts.append(head_surf(centre_yaw + rw * math.cos(a), centre_pitch + rh * math.sin(a))[0])
    return pts


# Ears: a soft cupped triangle; base at the origin, pink scooped front facing -Y before it is turned
EAR_H, EAR_W, EAR_T = 0.105, 0.078, 0.03
EAR_RIM = 0.012  # the ear's edge is never thinner than this: a soft bevelled rim, not a razor


def ear_local(d):
    """A soft cupped triangle with body: it narrows toward a ROUNDED tip (the width eases off
    near the top instead of running to a point), and its rim keeps EAR_RIM of thickness."""
    h = (d.z + 1) / 2
    x = d.x * EAR_W * (1 - 0.66 * h**1.25)
    core = EAR_T * (1 - 0.35 * h) * abs(d.y)
    if d.y > 0:
        y = core + EAR_RIM / 2
    else:
        # the scoop: the front face is pressed back into a bowl, deepest a little above the middle
        bowl = smoothstep(1.0, 0.3, math.hypot(d.x / 0.8, (d.z - 0.1) / 0.9))
        y = -EAR_RIM / 2 + core * (-0.4 + 0.95 * bowl)
    return Vector((x, y, h * EAR_H - 0.03))


def ear_turn(side):
    """Angled out ~27 degrees, tipped a little forward, the cup turned slightly outward."""
    return Matrix.Rotation(side * 0.3, 3, "Z") @ Matrix.Rotation(side * 0.47, 3, "Y") @ Matrix.Rotation(0.2, 3, "X")


def ear_front(s, h):
    """The front (cupped) surface of an ear in (across, height) parameters, with its forward normal."""
    z = 2 * h - 1
    x = s * math.sqrt(max(0.0, 1 - z * z)) * 0.999
    return Vector((x, -math.sqrt(max(0.0, 1 - x * x - z * z)), z))


def build():
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    mat = {name: material(name) for name in PALETTE}
    GINGER, CREAM = 0, 1

    # Body: the root pivot, on the floor under her middle
    body = bpy.data.objects.new("Body", None)
    body.empty_display_size = 0.1
    coll.objects.link(body)
    origin = Vector()

    # Loaf: pivot at its base, so squashing it never lifts her off the floor; a cream bib at the chest
    bm = shaped(24, loaf_shape)
    paint_by_plane(bm, Vector((0, -0.165, 0.065)), Vector((0, -1, -0.4)).normalized(), CREAM)
    make_object("Loaf", bm, origin, coll, body, origin, (mat["Mat_Ginger"], mat["Mat_Cream"]))

    # Head: pivot at the neck base; a cream muzzle and chin
    bm = shaped(44, head_point)  # dense enough that the muzzle's outline is a smooth curve
    paint_by_field(bm, muzzle_mask, CREAM, lambda q: head_project(q)[0])
    head = make_object("Head", bm, NECK, coll, body, origin, (mat["Mat_Ginger"], mat["Mat_Cream"]))

    # Face: painted on. Closed happy eyes (two arches), a :3 mouth, a nose, two blushes and the
    # three tabby stripes on her forehead
    CHOC, NOSE, BLUSH, TABBY = 0, 1, 2, 3
    bm = bmesh.new()
    for s in (-1, 1):
        stroke(bm, face_arc(s * 0.44, 0.1, math.pi, 0.0, 0.17, 0.1), 0.012, head_project, material=CHOC)
        stroke(bm, face_arc(s * 0.075, -0.3, math.pi, 2 * math.pi, 0.075, 0.07, 32), 0.0075, head_project, material=CHOC)
        patch(bm, head_surf, s * 0.74, -0.2, 0.14, 0.075, material=BLUSH)
    for yaw, lo, hi, lean, w in ((0.0, 0.52, 0.98, 0.0, 0.0095), (-0.21, 0.58, 0.86, -0.05, 0.008), (0.21, 0.58, 0.86, 0.05, 0.008)):
        path = [head_surf(yaw + lean * i / 24, lo + (hi - lo) * i / 24)[0] for i in range(25)]
        stroke(bm, path, w, head_project, material=TABBY, taper=0.55)
    # the nose: a soft upside-down triangle
    patch(bm, head_surf, 0.0, -0.165, 0.075, 0.05, outline=lambda th: 1 + 0.16 * math.cos(3 * (th + math.pi / 2)), lift=NOSE_LIFT, material=NOSE)
    make_object("Face", bm, NECK, coll, head, NECK, (mat["Mat_Chocolate"], mat["Mat_Nose"], mat["Mat_Blush"], mat["Mat_Tabby"]), closed=False)

    # Ears: pivots at their base on the skull, so a flick rotates them about where they grow
    for name, side in (("EarL", 1), ("EarR", -1)):
        d = head_dir(side * 0.6, 0.85)
        base = head_point(d) - head_normal(d) * 0.012
        turn = ear_turn(side)
        bm = shaped(12, lambda dd, b=base, m=turn: b + m @ ear_local(dd))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

        def ear_surf(s, h, b=base, m=turn, e=1e-3):
            p = ear_local(ear_front(s, h))
            n = (ear_local(ear_front(s + e, h)) - p).cross(ear_local(ear_front(s, h + e)) - p).normalized()
            n = -n if n.y > 0 else n  # out of the cup, toward the front
            return b + m @ p, m @ n

        # the pink inside of the cup: a rounded triangle pointing up to the tip
        patch(bm, ear_surf, 0.0, 0.47, 0.5, 0.27, outline=lambda th: 1 + 0.14 * math.cos(3 * (th - math.pi / 2)), material=1)
        make_object(name, bm, base, coll, head, NECK, (mat["Mat_Ginger"], mat["Mat_Blush"]), closed=False)

    # Paws: soft cream half-domes tucked under the chest, only their round tips peeking out; a soft
    # cleft down the front of each splits it into toes
    for name, side in (("PawL", 1), ("PawR", -1)):
        centre = Vector((side * 0.046, -0.17, 0.004))

        def paw(d, c=centre):
            q = superellipsoid(d, 2.2)
            cleft = math.exp(-((q.x / 0.17) ** 2)) * smoothstep(0.2, -0.85, q.y)
            z = q.z * 0.024 * (1 - 0.3 * cleft) if q.z > 0 else q.z * 0.004
            return c + Vector((q.x * 0.041, q.y * 0.05 + 0.007 * cleft, z))

        bm = shaped(16, paw)
        make_object(name, bm, Vector((side * 0.046, -0.125, 0.016)), coll, body, origin, (mat["Mat_Cream"],))

    # Tail: rooted in the rump, curled round her right flank along the floor, tapering to 65%
    root_r = 0.036

    def tail_r(s):
        return root_r * (1 - 0.35 * s)

    root = Vector((-0.06, 0.24, 0.075))
    flat = catmull_rom([Vector((x, y, 0)) for x, y in ((-0.06, 0.24), (-0.13, 0.305), (-0.198, 0.262), (-0.212, 0.13), (-0.2, 0.02))], 10)
    lengths = arc_lengths(flat)
    path = []
    for p, l in zip(flat, lengths):
        s = l / lengths[-1]
        path.append(Vector((p.x, p.y, tail_r(s) + (root.z - tail_r(0)) * smoothstep(0.28, 0.0, s))))
    bm = bmesh.new()
    tube(bm, path, tail_r)
    make_object("Tail", bm, root, coll, body, origin, (mat["Mat_Ginger"],))

    # Yawn and Tongue: authored at full size just inside the mouth, scaled to nothing at rest
    m_centre, m_normal = head_surf(0, -0.34)
    for name, key, half, sink in (("Yawn", "Mat_Mouth", Vector((0.036, 0.022, 0.03)), 0.014), ("Tongue", "Mat_Tongue", Vector((0.022, 0.03, 0.01)), 0.004)):
        centre = m_centre - m_normal * sink + (Vector((0, -0.012, -0.012)) if name == "Tongue" else Vector())
        bm = shaped(6, lambda d, c=centre, h=half: c + Vector((d.x * h.x, d.y * h.y, d.z * h.z)))
        ob = make_object(name, bm, centre, coll, head, NECK, (mat[key],))
        ob.scale = (0.001, 0.001, 0.001)

    # node names are global in a .blend: a clash (say, an avatar's "Body" in the same file) would
    # export as "Body.001" and break the rig contract, so refuse instead
    wrong = sorted(o.name for o in coll.all_objects if o.name not in NODE_NAMES)
    if wrong:
        raise RuntimeError(f"name clash, rename the other objects first: {wrong}")
    return coll


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()  # the purge leaves stale entries in the layer until it is refreshed
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        use_selection=True,
        export_animations=False,
        export_draco_mesh_compression_enable=False,
    )
    while True:
        try:
            bpy.ops.export_scene.gltf(**kwargs)
            return
        except TypeError as err:  # an option this Blender's exporter does not know: drop it
            bad = next((k for k in list(kwargs) if k in str(err) and k not in ("filepath", "export_format", "export_apply", "export_yup")), None)
            if not bad:
                raise
            kwargs.pop(bad)


def summary(coll):
    out, lo, hi = {}, Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in coll.all_objects:
        entry = {"parent": o.parent.name if o.parent else None, "location": [round(v, 4) for v in o.matrix_world.translation], "scale": [round(v, 4) for v in o.scale]}
        if o.type == "MESH":
            ws = [o.matrix_world @ v.co for v in o.data.vertices]
            mn = Vector([min(w[i] for w in ws) for i in range(3)])
            mx = Vector([max(w[i] for w in ws) for i in range(3)])
            entry["min"], entry["max"] = [round(v, 4) for v in mn], [round(v, 4) for v in mx]
            entry["tris"] = sum(len(p.vertices) - 2 for p in o.data.polygons)
            if o.scale.x > 0.5:  # Yawn / Tongue are scaled away at rest
                lo = Vector([min(a, b) for a, b in zip(lo, mn)])
                hi = Vector([max(a, b) for a, b in zip(hi, mx)])
        out[o.name] = entry
    size = hi - lo
    return {"bounds": {"width_x": round(size.x, 4), "length_y": round(size.y, 4), "height_z": round(size.z, 4), "min_z": round(lo.z, 5)}, "objects": out}


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_cat.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def main():
    report = globals().get("REPORT_PATH")
    try:
        coll = build()
        out = os.path.join(repo_root(), "client", "public", "models", "cat.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
