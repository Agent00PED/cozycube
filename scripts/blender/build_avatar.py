"""The player avatar: builds client/public/models/avatar.glb.

Run it inside Blender, either through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_avatar.py

or headless:

    blender -b -P scripts/blender/build_avatar.py

When the body is POSTed there is no `__file__`, so the repo root falls back to the COZYCUBE_ROOT
environment variable, then Blender's working directory. Define `REPO_ROOT` (and optionally
`REPORT_PATH`, where a JSON summary or the traceback is written) in front of the body to point it
somewhere explicitly.

A chibi clay figurine about 1.13 tall with its hair, soles on Z = 0. Coordinates are Blender's
(Z up, facing -Y, her left is +X); the glTF exporter turns them into three.js's (Y up, facing +Z).
Every part is its own object with its pivot at the joint and no rotation of its own, so the
runtime's swings are clean rotations about local axes (client/src/entities/rig.ts: AVATAR_NODES):

    Root                 an empty at the soles
      Body               everything that bobs, waddles and lies down
        Torso            the skin trunk, a soft pear; pivot at its base, so breathing grows it upward
          Top_<id>       a top's body and collar: hoodie, tee, flannel, hawaiian, tuxedo, robe,
                         yukata, jumpsuit (the runtime shows the outfit's one)
        Bottom_<id>      a bottom's seat and waist: sweats, overalls, trousers, shorts, wide
        Head             pivot at the neck base
          Eyes           pivot on the eye line: scaled in y to blink
          Face           blush, smile and the blush in each ear
          Hair_<style>   short, bob, wavy, messy (free); hero, drill, topknot, spacebuns, afro
                         (bought): the runtime shows the player's one
          Hat_<id>       beret, beanie, flower, headphones, straw, tophat, bunny, crown, mochiears
        ArmL / ArmR      pivots at the shoulders, hanging straight down (the runtime splays them):
                         skin arm and hand, fused
          Top_<id>_SleeveL / _SleeveR   the top's sleeve, swinging with the arm
          Mug            in the right hand, hidden until she holds a coffee
        LegL / LegR      pivots at the hips: skin leg and sneaker
          Bottom_<id>_LegL / _LegR      the bottom's leg, swinging and folding with the leg

The hip height and the leg radius are read out of shared/seats.ts, where the seat anchors are
derived from them: the legs are built to those numbers, so a seated avatar lands on the cushion.

Materials are the runtime's tint contract: Mat_Skin, Mat_Hair, Mat_Shirt, Mat_Pants and Mat_Accent are
recoloured per player from their look; Mat_Shoes and the face keep their own colours. The face is
painted on like Mochi's: flat sheets projected onto the head and lifted 0.002-0.004 along its
normal, flush in profile and never coplanar with it.

The ears are small soft domes at eye level, lying close along the skull, tops tipped back, their
roots flaring into it so they grow out of the head, with only a faint hollow. The hair is one continuous clay shell
grown out of the skull (`hair_shell`): fullest on the crown, grooved into soft locks round the sides
and back that sweep gently out of the whorl, arched high over each ear with a sideburn in front of it; the fringe is one clean, gently asymmetric piece. Buns and the long,
tapering drape are fused onto it; every style then goes through
the clay pipeline (join, voxel remesh, smooth, decimate: `fuse_clay`). After the build every style
is checked to keep clear of the ears (`ear_clearance`), and the build fails if one does not.

The body is a skin mannequin: a trunk turned on a lathe round a drawn silhouette (`TRUNK_PROFILE`),
arms fused with their hands (a slim wrist, a soft palm, a curved thumb), legs in sneakers (a fused
canvas upper on a thick flat sole). The clothes are separate, swappable garments, each a closed,
thick shell standing a set distance off the body (BOTTOM_OFF < TOP_OFF < OUTER_OFF, so no two
surfaces ever share a depth) with its inner skin buried in it and rounded lips at its hems. A
sleeve or a trouser leg starts in a ball round its joint's pivot, which turns in place however the
joint swings, so nothing opens at a joint; a trouser leg is AVATAR_HIP_OFFSET round, so seated the
trousers rest on the cushion. The hats are the wardrobe's nine (`HATS`), each in its own colours.

Every hair style and hat is its own object under Head, every garment piece its own object on its
part. After export the Blender viewport is left tidy: only the body in the default hair (`cap`) and
outfit (the hoodie and sweats) is shown; the other variants and the mug are disabled in the
viewport (still rendering, and re-enabled for every export).

Blender object names are global to the file and Mochi already owns "Body" and "Head", so every
object here is built as "AV_<name>" and the prefix is stripped from the GLB after export.
"""

import json
import math
import os
import re
import struct
import traceback

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

COLLECTION = "Avatar"
PREFIX = "AV_"
# the wardrobe's hair styles (shared/types.ts HAIR_STYLES): four free starters, then the shop's
HAIR_STYLES = ("short", "bob", "wavy", "messy", "hero", "drill", "topknot", "spacebuns", "afro")
HAT_IDS = ("beret", "beanie", "flower", "headphones", "straw", "tophat", "bunny", "crown", "mochiears")
TOP_IDS = ("hoodie", "tee", "flannel", "hawaiian", "tuxedo", "robe", "yukata", "jumpsuit")
BOTTOM_IDS = ("sweats", "overalls", "trousers", "shorts", "wide")
TOP_PARTS = (("", "Torso"), ("_SleeveL", "ArmL"), ("_SleeveR", "ArmR"))  # (name suffix, parent)
BOTTOM_PARTS = (("", "Body"), ("_LegL", "LegL"), ("_LegR", "LegR"))
NODE_NAMES = (
    ("Root", "Body", "Torso", "Head", "Eyes", "Face", "ArmL", "ArmR", "Mug", "LegL", "LegR")
    + tuple(f"Hair_{s}" for s in HAIR_STYLES)
    + tuple(f"Hat_{h}" for h in HAT_IDS)
    + tuple(f"Top_{t}{suffix}" for t in TOP_IDS for suffix, _ in TOP_PARTS)
    + tuple(f"Bottom_{b}{suffix}" for b in BOTTOM_IDS for suffix, _ in BOTTOM_PARTS)
)

# sRGB hex, converted to linear for Blender. The four tinted ones are only defaults.
PALETTE = {
    "Mat_Skin": "#FFD1B3",
    "Mat_Hair": "#4A2E1F",
    "Mat_Shirt": "#C85A44",  # terracotta: reads as cloth against every skin tone
    "Mat_Pants": "#5A5A66",
    "Mat_Shoes": "#3E4A61",  # the sneakers' canvas
    "Mat_Sole": "#F4EFE6",  # their rubber soles and laces
    "Mat_Accent": "#FF9AA2",  # tinted by the runtime: the outfit's accent colour
    "Mat_Trim": "#F7F3EA",  # white trims: collars, cuffs, a shirt front, drawstrings
    "Mat_Button": "#D9B25C",  # brass buttons
    "Mat_Eye": "#2B2024",
    "Mat_Glint": "#FFFFFF",
    "Mat_Blush": "#FF9EAE",
    "Mat_Mouth": "#6B3A34",
    "Mat_Mug": "#F7F3EA",
    "Mat_Beret": "#B8434A",
    "Mat_BeretBand": "#8F2F36",
    "Mat_Beanie": "#E0A93B",
    "Mat_BeanieCuff": "#C98F2A",
    "Mat_Pom": "#F7F3EA",
    "Mat_Petal": "#F59AB4",
    "Mat_PetalCentre": "#F2C94C",
    "Mat_Headphone": "#2F3F5C",
    "Mat_HeadphonePad": "#7D9471",
    "Mat_Straw": "#E8CF8A",
    "Mat_Ribbon": "#E0707A",
    "Mat_TopHat": "#1D1B22",
    "Mat_Bunny": "#FBF6F2",
    "Mat_BunnyInner": "#F5B3C3",
    "Mat_Crown": "#F2C23A",
    "Mat_Gem": "#D6334A",
    "Mat_MochiFur": "#E89A52",
}
# (metallic, roughness) for the few materials that are not matte clay
FINISH = {"Mat_Crown": (0.85, 0.35), "Mat_Gem": (0.0, 0.3), "Mat_Headphone": (0.2, 0.45)}
ROUGHNESS = 0.8
DECAL_LIFT = 0.002
GLINT_LIFT = 0.004


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    return Vector([_lin(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5)])


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gauss(d, centre, width):
    return math.exp(-((d - centre).length_squared) / width)


def superellipsoid(d, n):
    """Where direction d meets |x|^n + |y|^n + |z|^n = 1: n = 2 is a sphere, larger n a softly
    squared box. Smooth everywhere, so it never shows a crease."""
    return d / (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)


def tangents_of(d):
    a = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    e1 = d.cross(a).normalized()
    return e1, d.cross(e1).normalized()


def look_dir(yaw, pitch):
    """A direction: yaw + to her left (+X), pitch + up; 0, 0 straight ahead (-Y)."""
    return Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))


def yaw_pitch(d):
    return math.atan2(d.x, -d.y), math.asin(max(-1.0, min(1.0, d.z)))


# ---------------------------------------------------------------------------------------------
# mesh builders


def add_shaped(bm, cuts, shape, material=0):
    """Add a quad sphere to `bm`, its every vertex moved to shape(direction); returns its vertices.
    What is already in `bm` is tagged first, so only the new sphere is shaped."""
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    for v in new:
        v.co = shape(v.co.normalized())
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = material
    for v in bm.verts:
        v.tag = False
    return new


def ellipsoid(centre, half, n=2.0, floor=None):
    """An ellipsoid shape (a superellipsoid for n > 2); `floor` flattens its underside to that z."""

    def shape(d):
        q = superellipsoid(d, n)
        p = centre + Vector((q.x * half.x, q.y * half.y, q.z * half.z))
        if floor is not None and q.z < 0:
            p.z = centre.z + q.z * (centre.z - floor)
        return p

    return shape


def orient(faces, expected):
    for f in faces:
        f.normal_update()
        if f.normal.dot(expected(f)) < 0:
            f.normal_flip()


def arc_lengths(path):
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    return lengths


def line(a, b, steps=8):
    return [a.lerp(b, i / steps) for i in range(steps + 1)]


def tube(bm, path, radius, sides=16, cap_rings=5, material=0):
    """Sweep a circle along `path` (radius(s), s = 0..1 of its length) with round caps at both ends."""
    lengths = arc_lengths(path)
    total = lengths[-1]
    tangents = [(path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized() for i in range(len(path))]
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
    # a sweep is closed: point it outward from its own axis
    orient(faces, lambda f: f.calc_center_median() - min(path, key=lambda p: (p - f.calc_center_median()).length))


def patch(bm, surf, a0, b0, ra, rb, lift=DECAL_LIFT, material=0, rings=6, segs=32):
    """A painted spot: an ellipse in the (a, b) parameters of `surf` (a, b -> point, normal), each
    vertex on the surface and lifted `lift` along its normal."""
    normals = {}

    def vert(r, th):
        p, n = surf(a0 + ra * r * math.cos(th), b0 + rb * r * math.sin(th))
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


def stroke(bm, path, width, project, lift=DECAL_LIFT, material=0, across=4):
    """A painted line `width` wide along `path` (points on the surface), every vertex projected
    back onto it (project(q) -> point, normal) and lifted `lift`. Round ends."""
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
        env = math.sqrt(max(0.0, 1 - (1 - min(1.0, to_end / (width / 2))) ** 2))
        rows.append([vert(p)] if env < 1e-3 else [vert(p + side * (width / 2) * env * (2 * k / across - 1)) for k in range(across + 1)])
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


class Form:
    """A smooth closed form as a function of direction: a superellipsoid round `centre` with
    gaussian swells [(direction, amount, width)]. point(d) lies on it; param(q) inverts that for a
    point laid on it (the form is not radial, so a few fixed-point steps find it)."""

    def __init__(self, centre, half, n, swells=()):
        self.centre, self.half, self.n, self.swells = centre, half, n, swells

    def point(self, d):
        q = superellipsoid(d, self.n)
        p = Vector((q.x * self.half.x, q.y * self.half.y, q.z * self.half.z))
        return self.centre + p + d * sum(a * gauss(d, c, w) for c, a, w in self.swells)

    def normal(self, d, e=1e-3):
        p = self.point(d)
        e1, e2 = tangents_of(d)
        n = (self.point((d + e1 * e).normalized()) - p).cross(self.point((d + e2 * e).normalized()) - p).normalized()
        return -n if n.dot(p - self.centre) < 0 else n

    def surf(self, yaw, pitch):
        d = look_dir(yaw, pitch)
        return self.point(d), self.normal(d)

    def param(self, q):
        target = (q - self.centre).normalized()
        d = target.copy()
        for _ in range(8):
            d = (d + target - (self.point(d) - self.centre).normalized()).normalized()
        return d

    def project(self, q):
        d = self.param(q)
        return self.point(d), self.normal(d)


# ---------------------------------------------------------------------------------------------
# scene plumbing


def purge():
    """Remove the previous build: the Avatar collection and everything in it (Mochi is untouched)."""
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0 and (item.name.startswith(PREFIX) or item.name.split(".")[0] in PALETTE):
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
    metallic, roughness = FINISH.get(name, (0.0, ROUGHNESS))
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    m.diffuse_color = (*c, 1)
    m.roughness = roughness
    m.use_backface_culling = True  # exports single-sided: every mesh is closed or a decal facing out
    return m


def empty(name, collection, parent=None, at=Vector(), parent_at=Vector()):
    ob = bpy.data.objects.new(PREFIX + name, None)
    ob.empty_display_size = 0.1
    collection.objects.link(ob)
    ob.location = at - parent_at
    ob.parent = parent
    return ob


def make_object(name, bm, pivot, collection, parent, parent_pivot, mats, closed=True):
    """Turn a bmesh built in world coordinates into an object whose origin (pivot) is `pivot`."""
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=-pivot)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(PREFIX + name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(PREFIX + name, me)
    collection.objects.link(ob)
    ob.location = pivot - parent_pivot
    ob.parent = parent
    return ob


# ---------------------------------------------------------------------------------------------
# anatomy: metres of the diorama, soles on Z = 0, about 1.13 tall with her hair

LEG_X = 0.1
ANKLE_Z = 0.09  # where the leg meets the sneaker's collar
ANKLE_R = 0.05
SOLE_TOP = 0.028  # the rubber sole's thickness: the canvas sits on it
TORSO_PIVOT = Vector((0, 0, 0.17))
SHOULDER = Vector((0.19, 0, 0.5))  # out on the shoulder shelf, so the arms hang clear straight down
# The body under the clothes: a skin trunk turned on a lathe round a drawn silhouette, (r, z) from
# the bottom of the seat to the top of the neck, r a fraction of TRUNK_R (half width, half depth).
# A relaxed pear: near vertical at the waist, a gentle belly, the chest narrowing into rounded
# shoulders with a shelf across them for the arms. Its seat is at the hips' height less
# AVATAR_HIP_OFFSET, plus BOTTOM_OFF: with trousers on it rests on a cushion (checked in build)
TRUNK_R = (0.16, 0.138)
TRUNK_ROUND = 2.3  # its plan is a superellipse: a little squarer than an ellipse
TRUNK_PROFILE = (
    (0.0, 0.182), (0.55, 0.184), (0.85, 0.2), (0.97, 0.232), (1.02, 0.29), (1.02, 0.35),
    (0.97, 0.42), (0.92, 0.49), (0.87, 0.55), (0.8, 0.598), (0.68, 0.628), (0.52, 0.642), (0.0, 0.65),
)
SHOULDER_SHELF = 0.08
# The arms: radius at the shoulder ball and at the wrist, and how far down the wrist is; the hand
ARM_R = 0.056
WRIST_R = 0.036
WRIST_T = 0.2
HAND_Z = 0.255
# The clay pipeline for skin and canvas: (voxel size, smooth repeat, decimate ratio)
ARM_FUSE = (0.0045, 3, 0.4)
SHOE_FUSE = (0.005, 2, 0.5)
# Clothes. How far each layer's outer skin stands off the body (trousers, a top, a layer over a
# top), distinct so no two surfaces ever lie at the same depth, and how deep each inner skin is
# buried in it. A trouser leg's radius at the hip is AVATAR_HIP_OFFSET, read from shared/seats.ts.
BOTTOM_OFF = 0.012
TOP_OFF = 0.026
OUTER_OFF = 0.044
GARMENT_IN = 0.01
HEM_Z = 0.215  # a top's hem: a crisp horizontal edge low on the hips
WAIST_Z = 0.3  # a bottom's waist, tucked under the top
NECK_FRAC = 0.78  # a top's neckline: where the shoulders have narrowed to this much of the trunk
SLEEVE_LOOSE = 0.016
LONG_SLEEVE = 0.195
SHORT_SLEEVE = 0.085
LONG_LEG = 0.17
SHORT_LEG = 0.075
NECK = Vector((0, 0, 0.6))
UP = Vector((0, 0, 1))
# A squished sphere 0.52 wide and deep and 0.48 tall
HEAD = Form(
    Vector((0, 0, 0.82)),
    Vector((0.26, 0.26, 0.24)),
    2.2,
    # chubby cheeks, low on the face
    [(Vector((s * 0.72, -0.55, -0.42)).normalized(), 0.032, 0.12) for s in (-1, 1)],
)
EYE_PITCH = -0.02
# The ears: small soft half-spheres at eye level, sunk most of the way into the skull and lying
# close along its sides (turned out only a little, tops tipped back), with a shallow dip
EAR_YAW = 1.55
EAR_PITCH = -0.06
EAR_HALF = Vector((0.042, 0.05, 0.057))  # thin axis, front to back, up
EAR_ROOT_FLARE = 0.15  # how much wider the ear grows where it sinks into the skull
EAR_FRONT = 0.3  # how far the ear's front edge stands out, as a fraction of its back rim: it lies back
EAR_SINK = 0.006  # how far the ear's centre stands off the skull
EAR_SWEEP = 0.12  # radians the ear is turned out from the head: little, so it hugs the side
EAR_TILT = math.radians(15)  # its top tipped back toward the nape
EAR_CUP = 0.011  # how deep the soft hollow in its domed outer face is
EAR_CUP_DIR = Vector((1.0, -0.35, -0.12)).normalized()  # where the dip is centred, in the ear's frame
# How clear of the ears every visible hair vertex must stay (checked after the build)
EAR_CLEARANCE = 0.012

# The hair shell's soft locks round the sides and back: how many round the whole head, the yaw of
# the one they are centred on, and how far they curve round as they fall from the crown
HAIR_LOCKS = 11
HAIR_PART = 0.12
HAIR_SWEEP = 0.3
# How far the hair stands off the skull at the hairline, and the extra weight over the brow; the
# arch of the hairline over each ear
HAIR_RIM = 0.03
FRINGE_WEIGHT = 0.014
ARCH_PITCH = 0.44
ARCH_WIDTH = 0.34
# Each style's shell: its fringe (the pitch of its lowest point, the yaw it is lowest at, and how
# fast it curves up toward the temples: off centre, it sweeps to one side), how tousled that line
# is, a centre part, its nape, its sideburn framing the temple (yaw, width, how far it falls), how
# full it is on the crown and at the ends, how deep the grooves between its locks, and any soft
# tufts grown out of it (directions, height, width). Extras fused onto it are in HAIR_EXTRAS.
MESSY_TUFTS = (
    tuple(look_dir(2 * math.pi * i / 9 + 0.2 + 0.15 * math.sin(i * 2.3), 0.9 + 0.12 * math.sin(i * 1.3)) for i in range(9)) + (look_dir(0.4, 1.4),),
    0.075,
    0.52,
)
HAIR_DEFAULTS = dict(fringe=(0.33, -0.35, 0.11), wobble=0.0, part=0.0, nape=-0.42, sideburn=(1.1, 0.2, 0.3), crown=0.05, ends=0.0, groove=0.3, tufts=None)
HAIR = {
    "short": dict(),  # the hats are fitted to this one's crown
    "bob": dict(fringe=(0.27, 0.0, 0.06), nape=-0.78, sideburn=(1.13, 0.19, 0.62), ends=0.045, groove=0.2),
    "wavy": dict(fringe=(0.3, 0.35, 0.1), nape=-0.7, ends=0.03),
    "messy": dict(fringe=(0.33, 0.1, 0.1), wobble=0.045, nape=-0.36, tufts=MESSY_TUFTS),
    "hero": dict(fringe=(0.46, 0.0, 0.1), nape=-0.3),
    "drill": dict(fringe=(0.3, 0.0, 0.07), nape=-0.45),
    "topknot": dict(fringe=(0.37, 0.0, 0.1), part=0.1, crown=0.042, groove=0.0),
    "spacebuns": dict(fringe=(0.31, -0.2, 0.09)),
    "afro": dict(fringe=(0.48, 0.0, 0.08), crown=0.06, nape=-0.38, groove=0.0),
}
DRILL_YAW = 2.3  # where the drills hang, behind the ears
DRILL_LENGTH = 0.3
# The clay pipeline every style goes through: the voxel size of the remesh that welds its parts
# into one form, the Smooth modifier's repeat count, and the Decimate ratio for the web
VOXEL_SIZE = 0.011
SMOOTH_REPEAT = 2
DECIMATE_RATIO = 0.18


def soft_floor(z, k):
    """A smooth max(z, 0): flat below, with a rounded crease where it turns."""
    x = z / k
    return k * (x + math.log1p(math.exp(-x))) if x > 0 else k * math.log1p(math.exp(x))


def catmull_rom(points, per=16):
    """A smooth curve through `points` (2D tuples), sampled densely."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (Vector(p) for p in pts[i - 1 : i + 3])
        for k in range(per):
            t = k / per
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 * 1 - 3 * p2 + p3) * t**3))
    out.append(Vector(points[-1]))
    return out


def profile_at(curve, lengths, v):
    """The point a fraction v of the way along `curve` by arc length."""
    target = v * lengths[-1]
    for i in range(1, len(curve)):
        if lengths[i] >= target:
            f = (target - lengths[i - 1]) / max(1e-9, lengths[i] - lengths[i - 1])
            return curve[i - 1].lerp(curve[i], f)
    return curve[-1]


def band(bm, centre, rx, ry, half_r, half_z, roundness=3.0, tilt=0.0, segs=96, sides=12, material=0):
    """A smooth band round `centre` in the horizontal plane (tipped `tilt` about x): its centreline
    an ellipse (rx, ry), its cross-section a rounded rectangle half_r thick and half_z tall (a
    superellipse: 2 is a round tube, higher is squarer). Collars, cuffs, ribbons and hat bands."""
    rot = Matrix.Rotation(tilt, 3, "X")
    rows = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c = Vector((rx * math.cos(a), ry * math.sin(a), 0))
        out = Vector((ry * math.cos(a), rx * math.sin(a), 0)).normalized()
        row = []
        for t in (2 * math.pi * j / sides for j in range(sides)):
            ct, st = math.cos(t), math.sin(t)
            k = (abs(ct) ** roundness + abs(st) ** roundness) ** (-1 / roundness)
            row.append(bm.verts.new(centre + rot @ (c + out * (ct * k * half_r) + UP * (st * k * half_z))))
        rows.append(row)
    for i in range(segs):
        r0, r1 = rows[i], rows[(i + 1) % segs]
        for j in range(sides):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % sides], r0[(j + 1) % sides])).material_index = material


def disc(bm, centre, r_in, r_out, thick, lift=lambda r, a: 0.0, segs=72, rings=6, material=0):
    """A brim: a closed annulus r_in..r_out round `centre`, `thick` through, its midline raised
    lift(r, angle) (a droop or an upturn), with a rounded outer lip."""
    lip = 5

    def at(r, a, dz):
        return centre + Vector((r * math.cos(a), r * math.sin(a), lift(r, a) + dz))

    cols = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        col = [at(r_in + (r_out - r_in) * k / rings, a, thick / 2) for k in range(rings + 1)]
        col += [at(r_out + thick / 2 * math.sin(math.pi * j / lip), a, thick / 2 * math.cos(math.pi * j / lip)) for j in range(1, lip)]
        col += [at(r_in + (r_out - r_in) * k / rings, a, -thick / 2) for k in range(rings, -1, -1)]
        cols.append([bm.verts.new(p) for p in col])
    n = len(cols[0])
    for i in range(segs):
        c0, c1 = cols[i], cols[(i + 1) % segs]
        for k in range(n):  # the last quad closes the inner rim
            bm.faces.new((c0[k], c1[k], c1[(k + 1) % n], c0[(k + 1) % n])).material_index = material


def tilt_about(bm, pivot, rx=0.0, ry=0.0, rz=0.0):
    """Turn everything in `bm` about `pivot` (radians about x, then y, then z)."""
    m = Matrix.Translation(pivot) @ Euler((rx, ry, rz)).to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])


AXES = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))


def blob(centre, frame, half, n=2.0):
    """An ellipsoid (a superellipsoid for n != 2) with its half extents along the three axes of
    `frame`."""
    ex, ey, ez = frame

    def shape(d):
        q = superellipsoid(d, n)
        return centre + ex * (q.x * half.x) + ey * (q.y * half.y) + ez * (q.z * half.z)

    return shape


def cylinder(centre, radius, half_h, n=6.0):
    """A cylinder with softly rounded rims: round in plan, a superellipse in section."""

    def shape(d):
        rho = math.hypot(d.x, d.y)
        k = (rho**n + abs(d.z) ** n) ** (-1 / n)
        a = math.atan2(d.y, d.x)
        return centre + Vector((radius * rho * k * math.cos(a), radius * rho * k * math.sin(a), half_h * d.z * k))

    return shape


def aim_frame(axis):
    """A frame (across, through, along) whose third axis is `axis`."""
    axis = axis.normalized()
    across = (Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 1, 0))).cross(axis).normalized()
    return across, axis.cross(across), axis


# ---------------------------------------------------------------------------------------------
# the body under the clothes: a skin trunk, arms with hands, legs in sneakers


TRUNK_CURVE = catmull_rom([(r * TRUNK_R[0], z) for r, z in TRUNK_PROFILE])
TRUNK_LENGTHS = arc_lengths(TRUNK_CURVE)
TRUNK_DEPTH = TRUNK_R[1] / TRUNK_R[0]


def trunk_frame(v):
    """The trunk's silhouette a fraction v of the way from the bottom of the seat to the top of the
    neck: its point (r, z), outward normal and tangent, in the silhouette's plane."""
    p = profile_at(TRUNK_CURVE, TRUNK_LENGTHS, v)
    t = (profile_at(TRUNK_CURVE, TRUNK_LENGTHS, min(1.0, v + 1e-3)) - profile_at(TRUNK_CURVE, TRUNK_LENGTHS, max(0.0, v - 1e-3))).normalized()
    return p, Vector((t.y, -t.x)), t


def lift3(q, a):
    """A silhouette point (r, z) turned to angle `a` round the body (a = -pi/2 is straight ahead):
    a slightly squared plan, broadened across the shoulder shelf."""
    c, s = math.cos(a), math.sin(a)
    k = (abs(c) ** TRUNK_ROUND + abs(s) ** TRUNK_ROUND) ** (-1 / TRUNK_ROUND)
    shelf = 1 + SHOULDER_SHELF * math.exp(-(((q.y - SHOULDER.z) / 0.07) ** 2))
    return Vector((q.x * shelf * c * k, q.x * TRUNK_DEPTH * s * k, q.y))


def trunk_point(v, a, off=0.0):
    p, n, _ = trunk_frame(v)
    return lift3(p + n * off, a)


def trunk_surf(v, a, off=0.0):
    """A point `off` out from the trunk and the outward normal there."""
    p = trunk_point(v, a, off)
    n = (trunk_point(v, a + 1e-3, off) - p).cross(trunk_point(min(1.0, v + 1e-3), a, off) - p).normalized()
    out = Vector((p.x, p.y, 0.0)) + UP * (p.z - 0.4)
    return p, (n if n.dot(out) > 0 else -n)


def v_at_z(z):
    """Where the trunk's side reaches height z (its bottom disc and top dome skipped)."""
    c, lengths = TRUNK_CURVE, TRUNK_LENGTHS
    for i in range(1, len(c)):
        if c[i].x > 0.5 * TRUNK_R[0] and c[i - 1].y < z <= c[i].y:
            f = (z - c[i - 1].y) / (c[i].y - c[i - 1].y)
            return (lengths[i - 1] + f * (lengths[i] - lengths[i - 1])) / lengths[-1]
    raise ValueError(f"no trunk side at z={z}")


def v_at_neck(r_frac):
    """Where the trunk's shoulders have narrowed to r_frac of its width: a neckline."""
    c, lengths = TRUNK_CURVE, TRUNK_LENGTHS
    for i in range(1, len(c)):
        if c[i - 1].y > SHOULDER.z and c[i - 1].x >= r_frac * TRUNK_R[0] > c[i].x:
            f = (c[i - 1].x - r_frac * TRUNK_R[0]) / (c[i - 1].x - c[i].x)
            return (lengths[i - 1] + f * (lengths[i] - lengths[i - 1])) / lengths[-1]
    raise ValueError(f"no neckline at {r_frac}")


def trunk_skin(d):
    """The skin trunk as a shape for add_shaped: its silhouette turned round, pole to pole."""
    v = 0.5 + math.asin(max(-1.0, min(1.0, d.z))) / math.pi
    return trunk_point(v, math.atan2(d.y, d.x))


def stitch(bm, rings, poles=(None, None), cyclic=False, material=0):
    """Stitch rings of points (equal counts, same winding) into a closed surface: a pole vertex caps
    either end, or the last ring joins back to the first."""
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(vr[0])
    faces = []
    for r0, r1 in list(zip(vr, vr[1:])) + ([(vr[-1], vr[0])] if cyclic else []):
        faces += [bm.faces.new((r0[j], r0[(j + 1) % n], r1[(j + 1) % n], r1[j])) for j in range(n)]
    if poles[0] is not None:
        pv = bm.verts.new(poles[0])
        faces += [bm.faces.new((pv, vr[0][(j + 1) % n], vr[0][j])) for j in range(n)]
    if poles[1] is not None:
        pv = bm.verts.new(poles[1])
        faces += [bm.faces.new((pv, vr[-1][j], vr[-1][(j + 1) % n])) for j in range(n)]
    for f in faces:
        f.material_index = material


def trunk_shell(bm, v_lo, v_hi, off, material=0, close_lo=False, segs=32, rows=14, lip=4):
    """A garment round the trunk: a closed, thick shell whose outer skin stands `off` off the body
    between v_lo and v_hi, whose inner skin is buried GARMENT_IN inside it, the two rolling into
    each other in a rounded lip at each open edge (a hem, a neckline). With close_lo it starts at
    the bottom of the seat instead, closed there (trousers)."""
    angles = [2 * math.pi * j / segs for j in range(segs)]

    def ring(v, o, along=0.0):
        p, n, t = trunk_frame(v)
        q = p + n * o + t * along
        return [lift3(q, a) for a in angles]

    vs = [v_lo + (v_hi - v_lo) * i / rows for i in range(rows + 1)]
    half, mid = (off + GARMENT_IN) / 2, (off - GARMENT_IN) / 2
    rings = [ring(v, off) for v in vs]
    rings += [ring(v_hi, mid + half * math.cos(math.pi * k / lip), half * math.sin(math.pi * k / lip)) for k in range(1, lip)]
    rings += [ring(v, -GARMENT_IN) for v in reversed(vs)]
    if close_lo:
        bottom = lambda o: lift3(trunk_frame(0.0)[0] + Vector((0, -o)), 0.0)
        stitch(bm, rings[::-1], poles=(bottom(-GARMENT_IN), bottom(off)), material=material)
    else:
        rings += [ring(v_lo, mid + half * math.cos(math.pi * k / lip), -half * math.sin(math.pi * k / lip)) for k in range(lip - 1, 0, -1)]
        stitch(bm, rings, cyclic=True, material=material)


def axis_lathe(bm, origin, profile, segs=20, material=0):
    """Turn `profile` [(t, r)], pole to pole, round a vertical axis hanging from `origin` (t measured
    down it): arms, legs, sleeves and trouser legs, all hanging straight at rest."""
    angles = [2 * math.pi * j / segs for j in range(segs)]
    rings = [[origin + Vector((r * math.cos(a), r * math.sin(a), -t)) for a in angles] for t, r in profile[1:-1]]
    stitch(bm, rings, poles=(origin + Vector((0, 0, -profile[0][0])), origin + Vector((0, 0, -profile[-1][0]))), material=material)


def limb_profile(radius, length, cap=6, wall=12):
    """A limb's (t, r) profile: a ball round its joint's pivot, its wall down to `length`, a round
    end. The ball turns in place however the joint swings, so nothing ever opens at the joint."""
    r0, r1 = radius(0.0), radius(length)
    prof = [(-r0 * math.cos(th), r0 * math.sin(th)) for th in (math.pi / 2 * k / cap for k in range(cap))]
    prof += [(length * k / wall, radius(length * k / wall)) for k in range(wall + 1)]
    prof += [(length + r1 * math.sin(th), r1 * math.cos(th)) for th in (math.pi / 2 * k / cap for k in range(1, cap + 1))]
    return prof


def garment_profile(r_out, r_in, length, cap=5, wall=9, lip=4):
    """A sleeve's or a trouser leg's (t, r) profile, pole to pole: a ball round the joint's pivot,
    its outer wall down to the cuff, a rounded lip, its inner wall (inside the limb) back up, and
    an inner ball."""
    ro0, ri0 = r_out(0.0), r_in(0.0)
    ts = [length * k / wall for k in range(wall + 1)]
    ro, ri = r_out(length), r_in(length)
    half, mid = (ro - ri) / 2, (ro + ri) / 2
    prof = [(-ro0 * math.cos(th), ro0 * math.sin(th)) for th in (math.pi / 2 * k / cap for k in range(cap))]
    prof += [(t, r_out(t)) for t in ts]
    prof += [(length + half * math.sin(th), mid + half * math.cos(th)) for th in (math.pi * k / lip for k in range(1, lip))]
    prof += [(t, r_in(t)) for t in reversed(ts)]
    prof += [(-ri0 * math.sin(th), ri0 * math.cos(th)) for th in (math.pi / 2 * k / cap for k in range(1, cap + 1))]
    return prof


def arm_radius(t):
    return ARM_R - (ARM_R - WRIST_R) * smoothstep(0.04, WRIST_T, t)


def leg_radius(leg_r):
    return lambda t: leg_r - (leg_r - ANKLE_R) * smoothstep(0.05, 0.17, t)


def quad_bezier(a, b, c, steps=10):
    return [a * (1 - s) ** 2 + b * 2 * s * (1 - s) + c * s * s for s in (k / steps for k in range(steps + 1))]


def arm_skin(bm, side):
    """An arm and its hand, in skin: the arm tapering to a slim wrist; a soft, slightly squared
    palm; the rounded mitten of the fingers; and a curved thumb reaching forward and in, clear of
    the palm at its tip. Fused into one form afterwards."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    axis_lathe(bm, shoulder, limb_profile(arm_radius, WRIST_T + 0.02))
    x = shoulder.x
    add_shaped(bm, 12, blob(Vector((x, -0.004, HAND_Z)), AXES, Vector((0.03, 0.046, 0.05)), n=2.3))
    add_shaped(bm, 10, blob(Vector((x, -0.008, HAND_Z - 0.038)), AXES, Vector((0.028, 0.043, 0.032))))
    inward = -side
    path = quad_bezier(Vector((x + inward * 0.01, -0.03, HAND_Z + 0.022)), Vector((x + inward * 0.024, -0.062, HAND_Z + 0.008)), Vector((x + inward * 0.016, -0.068, HAND_Z - 0.022)))
    tube(bm, path, lambda s: 0.016 - 0.004 * s, sides=12, cap_rings=4)


def leg_skin(bm, side, hip_y, leg_r):
    hip = Vector((side * LEG_X, 0, hip_y))
    axis_lathe(bm, hip, limb_profile(leg_radius(leg_r), hip_y - ANKLE_Z + 0.015))


def floored(shape, floor):
    """`shape` with everything below `floor` pressed flat onto it (a soft crease where it turns)."""

    def pressed(d):
        w = shape(d)
        w.z = floor + soft_floor(w.z - floor, 0.006)
        return w

    return pressed


def slab(centre, rx, ry, half_h, n_plan=2.4, n_side=6.0):
    """A flat slab with a superellipse plan and softly rounded edges: a sole."""

    def shape(d):
        rho = math.hypot(d.x, d.y)
        k = (rho**n_side + abs(d.z) ** n_side) ** (-1 / n_side)
        a = math.atan2(d.y, d.x)
        c, s = math.cos(a), math.sin(a)
        kp = (abs(c) ** n_plan + abs(s) ** n_plan) ** (-1 / n_plan)
        return centre + Vector((rx * rho * k * c * kp, ry * rho * k * s * kp, half_h * d.z * k))

    return shape


def sneaker_upper(bm, side):
    """The sneaker's canvas: a rounded toe box, a heel that rises round the ankle, and a padded
    collar round the ankle. Fused into one form afterwards."""
    x = side * LEG_X
    add_shaped(bm, 14, floored(blob(Vector((x, -0.035, 0.05)), AXES, Vector((0.064, 0.096, 0.046)), n=2.2), SOLE_TOP - 0.004))
    add_shaped(bm, 12, floored(blob(Vector((x, 0.02, 0.064)), AXES, Vector((0.058, 0.052, 0.05))), SOLE_TOP - 0.004))
    band(bm, Vector((x, 0.012, 0.106)), 0.062, 0.06, 0.013, 0.012, roundness=2.2, segs=48, sides=10)


def sneaker_sole(bm, side):
    """A thick, flat rubber sole, a little proud of the canvas all round, flush on the floor."""
    add_shaped(bm, 12, slab(Vector((side * LEG_X, -0.028, SOLE_TOP / 2)), 0.071, 0.112, SOLE_TOP / 2))


def sneaker_laces(bm, side):
    """Three lace bars across the top of the toe box."""
    x = side * LEG_X
    for y in (-0.062, -0.041, -0.02):
        z = 0.05 + 0.046 * math.sqrt(max(0.0, 1 - ((y + 0.035) / 0.096) ** 2)) + 0.002
        slope = -math.atan(0.046 * ((y + 0.035) / 0.096**2) / math.sqrt(max(1e-4, 1 - ((y + 0.035) / 0.096) ** 2)))
        c, s = math.cos(slope), math.sin(slope)
        add_shaped(bm, 4, blob(Vector((x, y, z)), (Vector((1, 0, 0)), Vector((0, c, s)), Vector((0, -s, c))), Vector((0.027, 0.006, 0.005))))


# ---------------------------------------------------------------------------------------------
# clothes: every top is Top_<id> on the torso plus Top_<id>_SleeveL / _SleeveR on the arms; every
# bottom is Bottom_<id> on the body plus Bottom_<id>_LegL / _LegR on the legs. Each piece is built
# in the rest pose's world coordinates for the part it rides on.


def deco(bm, v, a, off, half, material=0, roll=0.0, n=2.0, cuts=6):
    """A small shape laid on a garment's surface (a pocket, a button, a lapel), in the surface's
    own frame: half = (across, out, up)."""
    p, nrm = trunk_surf(v, a, off)
    across = UP.cross(nrm).normalized()
    up = nrm.cross(across)
    c, s = math.cos(roll), math.sin(roll)
    add_shaped(bm, cuts, blob(p, (across * c + up * s, nrm, up * c - across * s), half, n), material=material)


def strip(bm, points, radius, material=0):
    """A soft strip (a strap, a collar edge, a drawstring) along points laid on a garment."""
    path = []
    for a, b in zip(points, points[1:]):
        path += [a.lerp(b, k / 6) for k in range(6)]
    tube(bm, path + [points[-1]], lambda s: radius, sides=8, cap_rings=2, material=material)


def trunk_patch(bm, v_lo, v_hi, a_lo, a_hi, off_out, off_in, material=0, nu=12, nv=8):
    """A panel that follows the trunk (a bib, a shirt front): a closed slab between two offsets,
    over heights v_lo..v_hi and angles a_lo..a_hi round the body."""
    grid = lambda off: [[bm.verts.new(trunk_point(v_lo + (v_hi - v_lo) * j / nv, a_lo + (a_hi - a_lo) * i / nu, off)) for j in range(nv + 1)] for i in range(nu + 1)]
    o, n = grid(off_out), grid(off_in)
    faces = []
    for i in range(nu):
        for j in range(nv):
            faces.append(bm.faces.new((o[i][j], o[i + 1][j], o[i + 1][j + 1], o[i][j + 1])))
            faces.append(bm.faces.new((n[i][j + 1], n[i + 1][j + 1], n[i + 1][j], n[i][j])))
    edge = [(i, 0) for i in range(nu)] + [(nu, j) for j in range(nv)] + [(i, nv) for i in range(nu, 0, -1)] + [(0, j) for j in range(nv, 0, -1)]
    for (i0, j0), (i1, j1) in zip(edge, edge[1:] + edge[:1]):
        faces.append(bm.faces.new((o[i0][j0], n[i0][j0], n[i1][j1], o[i1][j1])))
    for f in faces:
        f.material_index = material


def neck_band(bm, r_frac, off, half_r, half_z, material=0):
    """A crew-neck band: a rounded rim round the neckline where the top ends, over its lip."""
    v = v_at_neck(r_frac)
    px, py = trunk_point(v, 0.0, off), trunk_point(v, math.pi / 2, off)
    band(bm, Vector((0, 0, px.z + 0.004)), px.x, py.y, half_r, half_z, roundness=2.4, segs=56, sides=8, material=material)


def waist_band(bm, z, off, half_r, half_z, material=0):
    """A band round the trunk at height z. Under a top keep off + half_r well inside TOP_OFF (the
    band's thickness is not scaled front to back as the shells' offsets are)."""
    v = v_at_z(z)
    px, py = trunk_point(v, 0.0, off), trunk_point(v, math.pi / 2, off)
    band(bm, Vector((0, 0, z)), px.x, py.y, half_r, half_z, roundness=2.4, segs=56, sides=8, material=material)


def top_body(bm, hem_z=HEM_Z, neck=NECK_FRAC, off=TOP_OFF, material=0):
    trunk_shell(bm, v_at_z(hem_z), v_at_neck(neck), off, material)


def sleeve(bm, side, length, material=0, loose=SLEEVE_LOOSE, flare=0.0, cuff=None):
    """A sleeve round the arm, from a ball round the shoulder down to its cuff; `cuff` adds a band
    (its material index) round the cuff."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    r_out = lambda t: arm_radius(t) + loose + flare * (t / length) ** 2
    axis_lathe(bm, shoulder, garment_profile(r_out, lambda t: arm_radius(t) - GARMENT_IN, length), material=material)
    if cuff is not None:
        r = r_out(length)
        band(bm, shoulder - UP * (length - 0.006), r + 0.002, r + 0.002, 0.009, 0.011, segs=28, sides=6, material=cuff)


def pant_leg(bm, side, hip_y, leg_r, length, r_out, material=0, cuff=None, cuff_size=(0.01, 0.012)):
    """A trouser leg round the leg, from a ball round the hip (radius AVATAR_HIP_OFFSET, so seated
    it rests on the cushion) down to its cuff."""
    hip = Vector((side * LEG_X, 0, hip_y))
    axis_lathe(bm, hip, garment_profile(r_out, lambda t: leg_radius(leg_r)(t) - GARMENT_IN, length), material=material)
    if cuff is not None:
        r = r_out(length)
        band(bm, hip - UP * (length - 0.008), r + 0.002, r + 0.002, *cuff_size, segs=32, sides=6, material=cuff)


def front(a_off=0.0):
    """The angle round the body straight ahead, turned a_off toward her left."""
    return -math.pi / 2 + a_off


def top_hoodie(bm, part, side):
    # a pullover hoodie: the hood bunched behind the neck, a kangaroo pocket, drawstrings
    if part:
        return sleeve(bm, side, LONG_SLEEVE, cuff=0)
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.012, 0.026, 0.028)
    add_shaped(bm, 12, blob(Vector((0, 0.15, 0.6)), AXES, Vector((0.14, 0.055, 0.07))))
    deco(bm, v_at_z(0.3), front(), TOP_OFF + 0.004, Vector((0.1, 0.012, 0.048)), n=2.6, cuts=8)
    for s in (-1, 1):
        a = front(s * 0.22)
        strip(bm, [trunk_point(v_at_z(z), a, TOP_OFF + 0.006) for z in (0.59, 0.55, 0.51)], 0.006, material=1)


def top_tee(bm, part, side):
    # a plain crew-neck tee
    if part:
        return sleeve(bm, side, SHORT_SLEEVE, cuff=0)
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.016, 0.018)


def top_flannel(bm, part, side):
    # a flannel shirt with collar points, under a zipped puffer vest in the accent colour
    if part:
        return sleeve(bm, side, LONG_SLEEVE, cuff=0)
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.015, 0.017)
    for s in (-1, 1):
        deco(bm, v_at_z(0.585), front(s * 0.3), TOP_OFF + 0.012, Vector((0.034, 0.008, 0.03)), roll=s * 0.5)
    trunk_shell(bm, v_at_z(0.235), v_at_neck(0.86), OUTER_OFF, material=1)
    strip(bm, [trunk_point(v_at_z(z), front(), OUTER_OFF + 0.002) for z in (0.57, 0.45, 0.33, 0.24)], 0.005, material=2)


def top_hawaiian(bm, part, side):
    # a loose short-sleeved camp shirt: a flat open collar, buttons, and white flowers printed on
    if part:
        return sleeve(bm, side, SHORT_SLEEVE, loose=0.02, flare=0.008, cuff=0)
    top_body(bm)
    for s in (-1, 1):
        deco(bm, v_at_z(0.585), front(s * 0.42), TOP_OFF + 0.006, Vector((0.048, 0.008, 0.036)), roll=s * 0.35)
    for z in (0.5, 0.41, 0.32):
        deco(bm, v_at_z(z), front(), TOP_OFF + 0.002, Vector((0.009, 0.005, 0.009)), material=1, cuts=4)
    for z, a in ((0.45, 0.9), (0.33, -0.7), (0.27, 1.6), (0.52, -1.9), (0.38, 2.6), (0.3, -2.4), (0.48, 1.9)):
        v = v_at_z(z)
        surf = lambda aa, vv: trunk_surf(vv, aa, TOP_OFF)
        for k in range(5):
            ang = 2 * math.pi * k / 5
            patch(bm, surf, a + 0.07 * math.cos(ang), v + 0.02 * math.sin(ang), 0.065, 0.02, material=1, rings=2, segs=10)
        patch(bm, surf, a, v, 0.035, 0.011, lift=0.003, material=0, rings=2, segs=10)


def top_tuxedo(bm, part, side):
    # an evening jacket: a white shirt front, lapels and a bow tie in the accent colour, white cuffs
    if part:
        return sleeve(bm, side, LONG_SLEEVE, cuff=1)
    top_body(bm)
    deco(bm, v_at_z(0.52), front(), TOP_OFF + 0.002, Vector((0.05, 0.008, 0.078)), material=1)
    for s in (-1, 1):
        deco(bm, v_at_z(0.5), front(s * 0.4), TOP_OFF + 0.006, Vector((0.03, 0.009, 0.085)), material=2, roll=-s * 0.38, n=2.4)
        deco(bm, v_at_z(0.585), front(s * 0.13), TOP_OFF + 0.014, Vector((0.022, 0.012, 0.016)), material=2)
    deco(bm, v_at_z(0.585), front(), TOP_OFF + 0.018, Vector((0.009, 0.01, 0.011)), material=2, cuts=4)


def top_robe(bm, part, side):
    # a boxer's robe: long and loose, a white shawl collar and a tied white belt
    if part:
        return sleeve(bm, side, LONG_SLEEVE, loose=0.022, flare=0.01, cuff=1)
    top_body(bm, hem_z=0.19, off=TOP_OFF + 0.006)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.016, 0.024, 0.026, material=1)
    waist_band(bm, 0.3, TOP_OFF + 0.01, 0.012, 0.018, material=1)
    deco(bm, v_at_z(0.3), front(0.15), TOP_OFF + 0.026, Vector((0.028, 0.016, 0.022)), material=1)
    for s in (-1, 1):
        a = front(0.15 + s * 0.06)
        strip(bm, [trunk_point(v_at_z(z), a, TOP_OFF + 0.03) for z in (0.29, 0.25, 0.21)], 0.008, material=1)


def top_yukata(bm, part, side):
    # a cotton yukata: wide sleeves, the collar crossed left over right, an obi in the accent colour
    # tied in a bow at the back
    if part:
        return sleeve(bm, side, 0.16, loose=0.02, flare=0.035, cuff=0)
    top_body(bm, hem_z=0.19, off=TOP_OFF + 0.004)
    # her left panel laps over her right: its edge runs from her left shoulder down to the obi; the
    # right panel's edge shows only above the point where it passes under
    over = [trunk_point(v_at_z(z), front(a), TOP_OFF + 0.016) for z, a in ((0.6, 0.85), (0.53, 0.42), (0.45, 0.05), (0.34, -0.3))]
    under = [trunk_point(v_at_z(z), front(a), TOP_OFF + 0.012) for z, a in ((0.6, -0.85), (0.53, -0.42), (0.47, -0.08))]
    strip(bm, over, 0.012, material=1)
    strip(bm, under, 0.012, material=1)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.008, 0.012, 0.018, material=1)
    waist_band(bm, 0.3, TOP_OFF + 0.012, 0.014, 0.045, material=2)
    back = trunk_point(v_at_z(0.31), math.pi / 2, TOP_OFF + 0.04)
    for s in (-1, 1):
        add_shaped(bm, 8, blob(back + Vector((s * 0.05, 0.004, 0.0)), AXES, Vector((0.05, 0.02, 0.032))), material=2)
    add_shaped(bm, 6, blob(back + Vector((0, 0.012, 0)), AXES, Vector((0.02, 0.02, 0.026))), material=2)


def top_jumpsuit(bm, part, side):
    # a retro-futurist jumpsuit: a high collar, a zip and a band round the chest in neon accent,
    # accent cuffs
    if part:
        return sleeve(bm, side, LONG_SLEEVE, cuff=1)
    top_body(bm, hem_z=0.205)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.016, 0.032)
    waist_band(bm, 0.46, TOP_OFF + 0.002, 0.006, 0.01, material=1)
    strip(bm, [trunk_point(v_at_z(z), front(), TOP_OFF + 0.002) for z in (0.6, 0.45, 0.3, 0.21)], 0.005, material=1)


def waist(bm, off=BOTTOM_OFF, material=0):
    """The seat of any bottom: a shell from the bottom of the seat up to the waist."""
    trunk_shell(bm, 0.004, v_at_z(WAIST_Z), off, material, close_lo=True)


def bottom_sweats(bm, part, side, hip_y, leg_r, pant_r):
    # soft sweatpants gathered into cuffs at the ankle
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.018 * smoothstep(0.02, 0.15, t), cuff=0, cuff_size=(0.012, 0.014))
    waist(bm)
    waist_band(bm, WAIST_Z - 0.012, BOTTOM_OFF, 0.006, 0.016)


def bottom_overalls(bm, part, side, hip_y, leg_r, pant_r):
    # denim overalls: a bib and straps over the shoulders, brass buttons, rolled cuffs
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.012 * smoothstep(0.0, LONG_LEG, t), cuff=0, cuff_size=(0.014, 0.018))
    waist(bm)
    waist_band(bm, WAIST_Z - 0.012, BOTTOM_OFF, 0.006, 0.016)
    trunk_patch(bm, v_at_z(0.28), v_at_z(0.475), front(-0.5), front(0.5), TOP_OFF + 0.016, TOP_OFF - 0.004)
    for s in (-1, 1):
        a_front, a_back = front(s * 0.42), math.pi / 2 - s * 0.42
        over = [Vector((s * 0.088, y, 0.0)) for y in (-0.05, 0.0, 0.05)]
        pts = [trunk_point(v_at_z(z), a_front, TOP_OFF + 0.014) for z in (0.47, 0.53, 0.58)]
        pts += [Vector((p.x, p.y, trunk_point(v_at_neck(math.hypot(p.x, p.y / TRUNK_DEPTH) / TRUNK_R[0]), 0.0, 0.0).z + TOP_OFF + 0.014)) for p in over]
        pts += [trunk_point(v_at_z(z), a_back, TOP_OFF + 0.014) for z in (0.58, 0.5, 0.4, 0.31)]
        strip(bm, pts, 0.011)
        deco(bm, v_at_z(0.455), front(s * 0.4), TOP_OFF + 0.022, Vector((0.013, 0.008, 0.013)), material=1, cuts=4)


def bottom_trousers(bm, part, side, hip_y, leg_r, pant_r):
    # straight trousers with a waistband
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.015 * smoothstep(0.0, LONG_LEG, t))
    waist(bm)
    waist_band(bm, WAIST_Z - 0.012, BOTTOM_OFF, 0.006, 0.016)


def bottom_shorts(bm, part, side, hip_y, leg_r, pant_r):
    # loose shorts to mid-thigh, a waistband in the accent colour
    if part:
        return pant_leg(bm, side, hip_y, leg_r, SHORT_LEG, lambda t: pant_r + 0.012 * (t / SHORT_LEG) ** 1.2)
    waist(bm)
    waist_band(bm, WAIST_Z - 0.012, BOTTOM_OFF, 0.006, 0.018, material=1)


def bottom_wide(bm, part, side, hip_y, leg_r, pant_r):
    # wide, flowing trousers that flare toward the ankle
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r + 0.035 * (t / LONG_LEG) ** 1.5)
    waist(bm)
    waist_band(bm, WAIST_Z - 0.012, BOTTOM_OFF, 0.006, 0.016)


# each top and bottom: its materials, in material-index order, and its builder
TOPS = {
    "hoodie": (("Mat_Shirt", "Mat_Trim"), top_hoodie),
    "tee": (("Mat_Shirt",), top_tee),
    "flannel": (("Mat_Shirt", "Mat_Accent", "Mat_Trim"), top_flannel),
    "hawaiian": (("Mat_Shirt", "Mat_Trim"), top_hawaiian),
    "tuxedo": (("Mat_Shirt", "Mat_Trim", "Mat_Accent"), top_tuxedo),
    "robe": (("Mat_Shirt", "Mat_Trim"), top_robe),
    "yukata": (("Mat_Shirt", "Mat_Trim", "Mat_Accent"), top_yukata),
    "jumpsuit": (("Mat_Shirt", "Mat_Accent"), top_jumpsuit),
}
BOTTOMS = {
    "sweats": (("Mat_Pants",), bottom_sweats),
    "overalls": (("Mat_Pants", "Mat_Button"), bottom_overalls),
    "trousers": (("Mat_Pants",), bottom_trousers),
    "shorts": (("Mat_Pants", "Mat_Accent"), bottom_shorts),
    "wide": (("Mat_Pants",), bottom_wide),
}


# ---------------------------------------------------------------------------------------------
# assembly: pieces built as objects, some fused into clay, then joined into one part


def remesh(ob, voxel, smooth_repeat, ratio):
    """Voxel-remesh `ob` into one seamless form, soften it and decimate it."""
    solo = dict(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob])
    mats = list(ob.data.materials)
    ob.data.remesh_voxel_size = voxel
    ob.data.remesh_voxel_adaptivity = 0.0
    with bpy.context.temp_override(**solo):
        bpy.ops.object.voxel_remesh()
    mods = []
    if smooth_repeat:
        m = ob.modifiers.new("Smooth", "SMOOTH")
        m.iterations = smooth_repeat
        mods.append(m)
    if ratio:
        m = ob.modifiers.new("Decimate", "DECIMATE")
        m.ratio = ratio
        mods.append(m)
    with bpy.context.temp_override(**solo):
        for m in mods:
            bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.shade_smooth()
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)


def join(objs):
    """Join objs into the first (materials and all)."""
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    return objs[0]


def piece(name, build_piece, material, pivot, coll, fuse=None):
    """One piece of a part, built as its own object round `pivot`; `fuse` = (voxel, smooth repeat,
    decimate ratio) welds it into one seamless clay form."""
    bm = bmesh.new()
    build_piece(bm)
    ob = make_object(name, bm, pivot, coll, None, Vector(), (material,))
    if fuse:
        remesh(ob, *fuse)
    return ob


def assemble(name, pieces, parent, pivot, parent_pivot):
    """Join pieces into the part `name`, hung from `parent` at `pivot`."""
    ob = join(pieces)
    ob.name = PREFIX + name
    ob.data.name = PREFIX + name + "Mesh"
    ob.location = pivot - parent_pivot
    ob.parent = parent
    return ob


# ---------------------------------------------------------------------------------------------
# hair: one continuous clay shell grown out of the skull, its locks shaped into it


def hair_spec(style):
    return {**HAIR_DEFAULTS, **HAIR[style]}


def lock_phase(yaw, pitch):
    """0..1 across each lock: 1 along its ridge, 0 in the groove before the next. The locks curve
    round as they fall from the crown, so the grooves sweep gently out of the whorl."""
    flow = yaw - HAIR_PART + HAIR_SWEEP * (1 - pitch / (math.pi / 2))
    return 0.5 + 0.5 * math.cos(HAIR_LOCKS * flow)


def hair_edge(style, yaw):
    """The hairline, as the pitch it runs at for each yaw round the head: across the brow the
    style's fringe line (lowest at one point and curving up toward the temples, perhaps tousled or
    parted); arched up over each ear so the ears stay bare, with the style's sideburn framing the
    temple in front of each; behind, down to its nape."""
    h = hair_spec(style)
    a = abs(yaw)
    back = smoothstep(0.35, 0.9, (1 - math.cos(yaw)) / 2)  # 0 over the face, 1 at the nape
    low, low_yaw, curve = h["fringe"]
    front = low + curve * (yaw - low_yaw) ** 2 + h["wobble"] * math.sin(3.2 * yaw + 0.8) + h["part"] * math.exp(-((yaw / 0.14) ** 2))
    edge = front + (h["nape"] - front) * back
    arch = math.exp(-(((a - EAR_YAW) / ARCH_WIDTH) ** 2))
    edge += (ARCH_PITCH - edge) * arch
    yaw_b, width_b, drop_b = h["sideburn"]
    return edge - drop_b * math.exp(-(((a - yaw_b) / width_b) ** 2))


def hair_thickness(style, yaw, pitch, d):
    """How far the hair stands off the skull: fullest on the crown, fuller over the temples and
    weighty over the brow, fuller at the ends for a bob, grooved into soft locks round the sides
    and back (fading out toward the crown, where they merge), with any soft tufts grown out of it
    as rounded bumps."""
    h = hair_spec(style)
    t = HAIR_RIM + (h["crown"] - HAIR_RIM) * smoothstep(-0.3, 1.2, pitch)
    t += 0.012 * math.exp(-(((pitch - 0.35) / 0.35) ** 2))
    if h["ends"]:
        back = smoothstep(0.15, 0.85, (1 - math.cos(yaw)) / 2)
        t += h["ends"] * smoothstep(0.1, -0.5, pitch) * smoothstep(0.35, 0.75, back)
    fade = smoothstep(1.25, 0.45, pitch) * smoothstep(0.8, 1.4, abs(yaw))
    t *= 1 - h["groove"] * (1 - lock_phase(yaw, pitch)) ** 2 * fade
    over_brow = (1 - smoothstep(0.6, 1.3, abs(yaw))) * smoothstep(0.95, 0.4, pitch)
    t += FRINGE_WEIGHT * over_brow * (1 - 0.35 * max(-1.0, min(1.0, yaw / 0.9)))
    if h["tufts"]:
        dirs, height, width = h["tufts"]
        for s in dirs:
            ang = math.acos(max(-1.0, min(1.0, d.dot(s))))
            t += height * 0.5 * (1 + math.cos(math.pi * min(1.0, ang / width)))  # a soft, rounded bump
    return t


def hair_shell(bm, style):
    """The hair as one closed, thick shell: its outer skin stands hair_thickness off the skull up
    from the hairline, rolling over in a rounded lip that tucks under the skin; its inner skin
    lies under the skull; the two meet along the hairline. Rows run from the edge up to the crown,
    so the rim stays a clean line however the hairline winds."""
    lip_w = 0.07
    # the hairline as a polyline, so the lip is measured by true distance from it: where it runs
    # steeply (a sideburn, a part) it rolls over as softly as along the brow
    hairline = [(y, hair_edge(style, y)) for y in (-math.pi + 2 * math.pi * k / 720 for k in range(720))]

    def from_edge(yaw, pitch):
        c = math.cos(max(-1.3, min(1.3, pitch)))
        best = 1e9
        for y, e in hairline:
            dy = (yaw - y + math.pi) % (2 * math.pi) - math.pi
            if abs(dy) < 0.5:
                best = min(best, (dy * c) ** 2 + (pitch - e) ** 2)
        return math.sqrt(best)

    def outer(yaw, pitch, edge):
        d = look_dir(yaw, pitch)
        if pitch <= edge:
            return HEAD.point(d) - HEAD.normal(d) * 0.012
        lip = math.sqrt(max(0.0, 1 - (1 - min(1.0, from_edge(yaw, pitch) / lip_w)) ** 2))
        return HEAD.point(d) + HEAD.normal(d) * hair_thickness(style, yaw, pitch, d) * lip

    def inner(yaw, pitch):
        d = look_dir(yaw, pitch)
        return HEAD.point(d) - HEAD.normal(d) * 0.03

    n_yaw, n_rows = 180, 30
    outs, ins = [], []
    for i in range(n_yaw):
        yaw = -math.pi + 2 * math.pi * i / n_yaw
        edge = hair_edge(style, yaw)
        pitches = [edge - 0.02] + [edge + 1e-4 + (math.pi / 2 - edge) * (k / n_rows) ** 1.7 * 0.985 for k in range(n_rows)]
        outs.append([bm.verts.new(outer(yaw, p, edge)) for p in pitches])
        ins.append([bm.verts.new(inner(yaw, p)) for p in pitches])
    top_out = bm.verts.new(outer(0.0, math.pi / 2, -1.0))
    top_in = bm.verts.new(inner(0.0, math.pi / 2))
    for i in range(n_yaw):
        o0, o1, i0, i1 = outs[i], outs[(i + 1) % n_yaw], ins[i], ins[(i + 1) % n_yaw]
        for k in range(len(o0) - 1):
            bm.faces.new((o0[k], o1[k], o1[k + 1], o0[k + 1]))
            bm.faces.new((i0[k + 1], i1[k + 1], i1[k], i0[k]))
        bm.faces.new((o0[-1], o1[-1], top_out))
        bm.faces.new((i1[-1], i0[-1], top_in))
        bm.faces.new((i0[0], i1[0], o1[0], o0[0]))  # the rim along the hairline


def knob(yaw, pitch, radius, stand):
    """A round knob (a bun, a puff) sat on the head, its centre `stand` out along the normal."""
    p, n = HEAD.surf(yaw, pitch)
    return blob(p + n * stand, AXES, Vector((radius,) * 3))


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return p0 * u**3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t**3


def hair_drape(bm, width=0.15, wave=0.0, end=Vector((0, 0.22, 0.45)), stations=28, around=24):
    """A long fall: a lofted drape from the nape down behind the shoulders along a gentle S. It
    narrows and thins as it falls, its sides wrap a little round the back, it swells in soft
    layers (and waves from side to side), and it ends in a rounded taper. Its top is buried in the
    shell, where it fuses."""
    ctrl = (Vector((0, 0.18, 0.78)), Vector((0, 0.235, 0.67)), Vector((0, 0.212, 0.56)), end)
    rows, centres = [], []
    for i in range(stations + 1):
        s_ = i / stations
        c = bezier(*ctrl, s_)
        t = (bezier(*ctrl, min(1.0, s_ + 1e-3)) - bezier(*ctrl, max(0.0, s_ - 1e-3))).normalized()
        n = (Vector((0, 1, 0)) - t * t.y).normalized()  # out behind her
        right = t.cross(n).normalized()
        c = c + right * wave * math.sin(2 * math.pi * 1.5 * s_) * s_
        tip = math.sqrt(max(0.0, 1 - max(0.0, (s_ - 0.72) / 0.28) ** 2))
        w = (width - 0.05 * s_) * max(tip, 0.02)
        th = (0.034 - 0.012 * s_) * (1 + 0.12 * math.sin(2 * math.pi * 2 * s_)) * max(tip, 0.02)
        ring = []
        for j in range(around):
            a = 2 * math.pi * j / around
            ca, sa = math.cos(a), math.sin(a)
            x = w * math.copysign(abs(ca) ** (2 / 2.6), ca)
            y = th * math.copysign(abs(sa) ** (2 / 2.6), sa) - 0.035 * (x / max(w, 1e-6)) ** 2 * (w / 0.15)
            ring.append(bm.verts.new(c + right * x + n * y))
        rows.append(ring)
        centres.append(c)
    top = bm.verts.new(centres[0])
    end_v = bm.verts.new(centres[-1] + (centres[-1] - centres[-2]).normalized() * 0.004)
    for j in range(around):
        j1 = (j + 1) % around
        bm.faces.new((top, rows[0][j1], rows[0][j]))
        bm.faces.new((end_v, rows[-1][j], rows[-1][j1]))
        for r0, r1 in zip(rows, rows[1:]):
            bm.faces.new((r0[j], r0[j1], r1[j1], r1[j]))


def face_strands(bm, reach=-0.62, radius=0.028, wave=0.008):
    """A lock falling from each temple past the cheek in front of the ear, tapering to a soft
    point, rippling gently; its root is buried in the shell."""
    for side in (-1, 1):
        pts = []
        for k in range(13):
            f = k / 12
            pitch = 0.45 + (reach - 0.45) * f
            p, n = HEAD.surf(side * (1.08 + 0.06 * f), pitch)
            pts.append(p + n * (0.02 + 0.016 * f) + Vector((side * wave * math.sin(math.pi * 2 * f), 0, 0)))
        tube(bm, pts, lambda s: radius * (1 - 0.6 * s), sides=12, cap_rings=4)


def hero_spikes(bm):
    """Big anime spikes: long soft cones sweeping up and back off the crown, and two pointed bangs
    falling forward over the brow, one longer than the other."""
    back = Vector((0, 1, 0))
    crown = [(0.1, 1.2, 1.3, 0.15), (0.65, 0.95, 1.2, 0.14), (-0.55, 0.95, 1.2, 0.14), (1.3, 0.8, 1.3, 0.12), (-1.3, 0.8, 1.3, 0.12), (2.25, 0.75, 1.6, 0.13), (-2.25, 0.75, 1.6, 0.13), (3.1, 0.9, 1.5, 0.14)]
    for yaw, pitch, lean, length in crown:
        p, n = HEAD.surf(yaw, pitch)
        axis = (n + back * lean * 0.75 + UP * 0.15).normalized()
        add_shaped(bm, 10, blob(p + n * 0.01 + axis * length * 0.5, aim_frame(axis), Vector((0.09, 0.07, length)), n=1.7))
    for yaw, length in ((-0.3, 0.13), (0.28, 0.1)):
        p, n = HEAD.surf(yaw, 0.78)
        axis = (Vector((0, -0.45, -1.0)) + Vector((yaw * 0.4, 0, 0))).normalized()
        add_shaped(bm, 10, blob(p + n * 0.035 + axis * length * 0.45, aim_frame(axis), Vector((0.05, 0.03, length)), n=1.6))


def drills(bm):
    """Twin drill tails: a tapering coil hanging behind each ear, from the ribbon down to a point."""
    for side in (-1, 1):
        p, n = HEAD.surf(side * DRILL_YAW, 0.3)
        root = p + n * 0.035
        pts = []
        for k in range(49):
            f = k / 48
            ang = side * 2 * math.pi * 2.5 * f
            rh = 0.026 * (1 - 0.5 * f)
            pts.append(root + Vector((side * 0.05 * f + rh * math.cos(ang), 0.05 * f + rh * math.sin(ang), -DRILL_LENGTH * f)))
        tube(bm, pts, lambda s: 0.05 * (1 - 0.72 * s) + 0.006, sides=14, cap_rings=4)


def drill_ribbons(bm):
    """A ribbon bow tied at the root of each drill."""
    for side in (-1, 1):
        p, n = HEAD.surf(side * DRILL_YAW, 0.3)
        c = p + n * 0.075
        across = UP.cross(n).normalized()
        up = n.cross(across)
        for s in (-1, 1):
            add_shaped(bm, 8, blob(c + across * s * 0.036, (across, n, up), Vector((0.034, 0.014, 0.024))))
        add_shaped(bm, 6, blob(c + n * 0.004, AXES, Vector((0.014,) * 3)))


def topknot(bm):
    """A sleek knot high on the back of the crown and a short tail springing out of it."""
    p, n = HEAD.surf(math.pi, 1.12)
    c = p + n * 0.07
    add_shaped(bm, 12, blob(c, AXES, Vector((0.075, 0.07, 0.066))))
    tail = [c + Vector((0, 0.04, 0.02)), c + Vector((0, 0.085, 0.015)), c + Vector((0, 0.12, -0.02)), c + Vector((0, 0.14, -0.07))]
    tube(bm, tail, lambda s: 0.045 * (1 - 0.65 * s), sides=14, cap_rings=4)


def topknot_tie(bm):
    p, n = HEAD.surf(math.pi, 1.12)
    c = p + n * 0.07 + Vector((0, 0.045, 0.02))
    add_shaped(bm, 8, blob(c, AXES, Vector((0.036, 0.016, 0.036))))


def cloud_puffs(bm):
    """A pillowy cloud of curls: round puffs all over the crown and sides, clear of the face and
    the ears, fused into one bubbly silhouette."""
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(80):
        z = 1 - 2 * (i + 0.5) / 80
        r = math.sqrt(1 - z * z)
        d = Vector((r * math.cos(golden * i), r * math.sin(golden * i), z))
        yaw, pitch = yaw_pitch(d)
        a = abs(yaw)
        if pitch < 0.28 or (a < 0.95 and pitch < 0.78) or (1.1 < a < 2.05 and pitch < 0.62):
            continue
        add_shaped(bm, 8, knob(yaw, pitch, 0.07 + 0.012 * math.sin(i * 1.7), 0.06))


# the parts every style adds to its shell (fused into it) and its trims (in their own material)
HAIR_EXTRAS = {
    "wavy": [lambda bm: hair_drape(bm, width=0.16, wave=0.02, end=Vector((0, 0.23, 0.42))), face_strands],
    "hero": [hero_spikes],
    "drill": [drills],
    "topknot": [topknot, lambda bm: face_strands(bm, reach=-0.25, radius=0.022, wave=0.0)],
    "spacebuns": [lambda bm, s=s: add_shaped(bm, 12, knob(s * 1.0, 0.9, 0.085, 0.075)) for s in (-1, 1)],
    "afro": [cloud_puffs],
}
HAIR_TRIMS = {
    "drill": [("Mat_Ribbon", drill_ribbons)],
    "topknot": [("Mat_Ribbon", topknot_tie)],
}


def hair_parts(style):
    """What one hair style is made of, as bmesh builders: the shell, then everything fused onto it."""
    return [lambda bm: hair_shell(bm, style)] + HAIR_EXTRAS.get(style, [])


def ensure_object_mode():
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def fuse_clay(name, parts, coll, head, hair_mat, trims=()):
    """Clay fusion: build every part as its own object, join them into one, voxel-remesh the union
    into a single seamless form (welding a bun onto the shell with a soft fillet), soften it, and
    decimate it for the web runtime. Trims [(material, builder)] (ribbons, a hair tie) are joined
    on afterwards in their own materials."""
    objs = []
    for i, build_part in enumerate(parts):
        bm = bmesh.new()
        build_part(bm)
        objs.append(make_object(f"{name}_part{i}", bm, NECK, coll, None, Vector(), (hair_mat,)))
    ob = objs[0]
    ob.name = PREFIX + name
    ob.data.name = PREFIX + name + "Mesh"
    solo = dict(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob])
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=ob, object=ob, selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    ob.data.remesh_voxel_size = VOXEL_SIZE
    ob.data.remesh_voxel_adaptivity = 0.0
    with bpy.context.temp_override(**solo):
        bpy.ops.object.voxel_remesh()
    smooth = ob.modifiers.new("Smooth", "SMOOTH")
    smooth.iterations = SMOOTH_REPEAT
    decimate = ob.modifiers.new("Decimate", "DECIMATE")
    decimate.ratio = DECIMATE_RATIO
    with bpy.context.temp_override(**solo):
        for mod in (smooth, decimate):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.shade_smooth()
    ob.data.materials.clear()
    ob.data.materials.append(hair_mat)
    if trims:
        ob = join([ob] + [piece(f"{name}_trim{i}", build_trim, trim_mat, NECK, coll) for i, (trim_mat, build_trim) in enumerate(trims)])
    ob.location = NECK - NECK  # now a child of the head, which pivots at the neck too
    ob.parent = head
    return ob


# ---------------------------------------------------------------------------------------------
# hats: each a child of the head, sized to sit on the hair; the runtime shows the player's one


def headband(bm, lean, radius_x, lift, half, material, reach=1.25):
    """A band over the crown, in the plane `lean` behind the ears, running `reach` radians down
    each side from the top (far enough to tuck into the hair, or into a headphone cup)."""
    path = [Vector((radius_x * math.sin(t), lean, HEAD.centre.z + lift * math.cos(t))) for t in (-reach + 2 * reach * i / 40 for i in range(41))]
    tube(bm, path, lambda s: half, sides=12, cap_rings=3, material=material)


def hat_beret(bm):
    # a soft pancake slumped over to one side, on a band that sits on the hair, with a little stalk
    band(bm, Vector((0, 0.01, 1.03)), 0.182, 0.19, 0.016, 0.018, material=1)
    top = bmesh.new()
    add_shaped(top, 14, blob(Vector((0.04, 0.02, 1.085)), AXES, Vector((0.25, 0.26, 0.07)), n=2.2))
    tube(top, line(Vector((0.04, 0.02, 1.14)), Vector((0.04, 0.02, 1.185)), 4), lambda s: 0.012, sides=10, cap_rings=3)
    tilt_about(top, Vector((0.04, 0.02, 1.085)), rx=-0.12, ry=0.32)
    merge_into(bm, top)


def hat_beanie(bm):
    # a knit dome over the hair down to the brow (lower at the back), a folded cuff, a pom-pom
    slope = 0.18

    def shape(d):
        q = superellipsoid(d, 2.2)
        w = Vector((0, 0.015, 0.915)) + Vector((q.x * 0.3, q.y * 0.31, q.z * 0.26))
        cut = 0.95 - slope * w.y
        w.z = cut + soft_floor(w.z - cut, 0.01)
        return w

    add_shaped(bm, 18, shape)
    band(bm, Vector((0, 0.015, 0.982)), 0.291, 0.301, 0.014, 0.032, roundness=3.0, tilt=-math.atan(slope), material=1)
    add_shaped(bm, 10, blob(Vector((0, 0.03, 1.19)), AXES, Vector((0.056,) * 3)), material=2)


def hat_flower(bm):
    # a five-petal bloom tucked into the hair above the ear
    p, n = HEAD.surf(1.0, 0.56)
    up = (UP - n * UP.dot(n)).normalized()
    across = up.cross(n)
    centre = p + n * 0.058
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        radial = across * math.cos(a) + up * math.sin(a)
        add_shaped(bm, 8, blob(centre + radial * 0.036, (radial, radial.cross(n), n), Vector((0.036, 0.026, 0.012))))
    add_shaped(bm, 8, blob(centre + n * 0.01, AXES, Vector((0.02,) * 3)), material=1)


def hat_headphones(bm):
    # a band over the crown and a cup over each ear, a soft pad on its inner face
    headband(bm, -0.005, 0.318, 0.315, 0.02, 0, reach=1.45)
    for side in (-1, 1):
        add_shaped(bm, 10, blob(Vector((side * 0.302, 0.0, 0.81)), AXES, Vector((0.036, 0.074, 0.082)), n=3.0))
        add_shaped(bm, 8, blob(Vector((side * 0.268, 0.0, 0.81)), AXES, Vector((0.02, 0.062, 0.07))), material=1)


def hat_straw(bm):
    # a round crown over the hair, a wide brim drooping at the edge, a ribbon round the crown;
    # tipped back a little so the brim never hides the eyes from the room's camera
    def crown(d):
        q = superellipsoid(d, 2.2)
        w = Vector((0, 0.015, 0.975)) + Vector((q.x * 0.29, q.y * 0.3, q.z * 0.17))
        w.z = 0.975 + soft_floor(w.z - 0.975, 0.008)
        return w

    add_shaped(bm, 16, crown)
    disc(bm, Vector((0, 0.015, 0.975)), 0.2, 0.42, 0.016, lambda r, a: -0.05 * max(0.0, (r - 0.28) / 0.14) ** 2)
    band(bm, Vector((0, 0.015, 0.995)), 0.292, 0.302, 0.012, 0.02, material=1)
    tilt_about(bm, Vector((0, 0.0, 0.975)), rx=-0.14)


def hat_tophat(bm):
    # a short, stout toy top hat perched on the crown: a brim turned up at the sides, a ribbon
    add_shaped(bm, 14, cylinder(Vector((0, 0.015, 1.16)), 0.195, 0.12))
    disc(bm, Vector((0, 0.015, 1.045)), 0.12, 0.3, 0.018, lambda r, a: 0.035 * abs(math.cos(a)) * max(0.0, (r - 0.2) / 0.1) ** 2)
    band(bm, Vector((0, 0.015, 1.075)), 0.197, 0.197, 0.006, 0.022, roundness=4.0, material=1)
    tilt_about(bm, Vector((0, 0.015, 1.045)), rx=-0.1, ry=-0.06)


def hat_bunny(bm):
    # two tall soft ears with pink insides on a band over the crown
    headband(bm, 0.02, 0.285, 0.305, 0.014, 0)
    for side in (-1, 1):
        base = Vector((side * 0.105, 0.02, 1.09))
        along = Vector((side * 0.25, 0.12, 1.0)).normalized()
        across, through, along = aim_frame(along)
        centre = base + along * 0.13
        add_shaped(bm, 12, blob(centre, (across, through, along), Vector((0.055, 0.028, 0.14))))
        front = through if through.y < 0 else -through
        add_shaped(bm, 8, blob(centre + front * 0.02 + along * 0.01, (across, through, along), Vector((0.03, 0.01, 0.095))), material=1)


def hat_crown(bm):
    # a little gold crown set jauntily on the crown of the head: a band, six points, red gems
    centre = Vector((0, 0.01, 1.06))
    band(bm, centre, 0.175, 0.18, 0.012, 0.03, roundness=4.0)
    for i in range(6):
        a = 2 * math.pi * i / 6 + math.pi / 6
        radial = Vector((math.cos(a), math.sin(a), 0))
        at = centre + Vector((0.175 * math.cos(a), 0.18 * math.sin(a), 0.045))
        add_shaped(bm, 8, blob(at, (UP.cross(radial), radial, UP), Vector((0.03, 0.012, 0.05)), n=1.6))
        g = a + math.pi / 6
        add_shaped(bm, 5, blob(centre + Vector((0.188 * math.cos(g), 0.193 * math.sin(g), 0)), AXES, Vector((0.015,) * 3)), material=1)
    tilt_about(bm, centre, ry=0.12)


def hat_mochiears(bm):
    # Mochi's own ears: soft pointed cat ears with pink insides, on a band over the crown
    headband(bm, 0.02, 0.285, 0.305, 0.014, 0)
    for side in (-1, 1):
        base = Vector((side * 0.17, 0.02, 1.05))
        across, through, along = aim_frame(Vector((side * 0.45, 0.05, 1.0)))
        centre = base + along * 0.055
        add_shaped(bm, 10, blob(centre, (across, through, along), Vector((0.07, 0.035, 0.085)), n=1.5))
        front = through if through.y < 0 else -through
        add_shaped(bm, 8, blob(centre + front * 0.026 - along * 0.008, (across, through, along), Vector((0.04, 0.012, 0.055)), n=1.5), material=1)


# each hat: its builder and its materials, in material-index order
HATS = {
    "beret": (hat_beret, ("Mat_Beret", "Mat_BeretBand")),
    "beanie": (hat_beanie, ("Mat_Beanie", "Mat_BeanieCuff", "Mat_Pom")),
    "flower": (hat_flower, ("Mat_Petal", "Mat_PetalCentre")),
    "headphones": (hat_headphones, ("Mat_Headphone", "Mat_HeadphonePad")),
    "straw": (hat_straw, ("Mat_Straw", "Mat_Ribbon")),
    "tophat": (hat_tophat, ("Mat_TopHat", "Mat_Ribbon")),
    "bunny": (hat_bunny, ("Mat_Bunny", "Mat_BunnyInner")),
    "crown": (hat_crown, ("Mat_Crown", "Mat_Gem")),
    "mochiears": (hat_mochiears, ("Mat_MochiFur", "Mat_BunnyInner")),
}


def merge_into(bm, other):
    """Move everything in bmesh `other` into `bm` (keeping material indices) and free it."""
    me = bpy.data.meshes.new("AV_tmp")
    other.to_mesh(me)
    other.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


# ---------------------------------------------------------------------------------------------
# ears


def ear_frames():
    """Each ear as (side, centre, frame): a half-sphere at eye level, sunk most of the way into the
    skull, its frame (thin axis, front-to-back, up) turned only EAR_SWEEP out from the head so it
    hugs the side, and tipped EAR_TILT back so its top leans toward the nape."""
    out = []
    for side in (-1, 1):
        p, n = HEAD.surf(side * EAR_YAW, EAR_PITCH)
        o = Vector((n.x, n.y, 0)).normalized()
        back = UP.cross(o) * side
        c, s = math.cos(EAR_SWEEP), math.sin(EAR_SWEEP)
        ex, ey = o * c - back * s, back * c + o * s
        ct, st = math.cos(EAR_TILT), math.sin(EAR_TILT)
        out.append((side, p + n * EAR_SINK, (ex, ey * ct - UP * st, UP * ct + ey * st)))
    return out


def ear_shape(centre, frame):
    """The ear: a soft shell lying back along the skull. Its front edge sits almost flush with the
    head and it rises toward a rounded rim at the back, the way an ear grows out of the side of a
    head; its root widens a little as it sinks into the skull, and a faint hollow sits a little
    forward of centre."""
    ex, ey, ez = frame
    h = EAR_HALF

    def shape(d):
        q = superellipsoid(d, 2.0)
        spread = 1 + EAR_ROOT_FLARE * smoothstep(0.3, -0.7, q.x)
        rise = EAR_FRONT + (1 - EAR_FRONT) * smoothstep(-0.95, 0.45, q.y) if q.x > 0 else 1.0
        cup = EAR_CUP * smoothstep(0.55, 0.95, d.dot(EAR_CUP_DIR))
        return centre + ex * (q.x * h.x * rise - cup) + ey * (q.y * h.y * spread) + ez * (q.z * h.z * spread)

    return shape


def ear_surf(centre, frame):
    """(a, b) -> point, normal on an ear, for painting into its dip: a round from its outward
    face toward the back, b up."""
    shape = ear_shape(centre, frame)

    def surf(a, b):
        d = Vector((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        p = shape(d)
        e1, e2 = tangents_of(d)
        n = (shape((d + e1 * 1e-3).normalized()) - p).cross(shape((d + e2 * 1e-3).normalized()) - p).normalized()
        return p, (n if n.dot(frame[0]) > 0 else -n)

    return surf


def inside_head(w):
    q = w - HEAD.centre
    h = HEAD.half
    return abs(q.x / h.x) ** HEAD.n + abs(q.y / h.y) ** HEAD.n + abs(q.z / h.z) ** HEAD.n < 1


def ear_clearance(coll):
    """The visible hair vertices of each style (those not buried in the skull) that come within
    EAR_CLEARANCE of an ear: must be none, so every ear stands clear of every hair style. Each ear
    is tested as its whole ellipsoid in its swept frame, grown by EAR_CLEARANCE (the cup only
    takes volume away, so this is the ear's outer envelope)."""
    ears = ear_frames()
    h = EAR_HALF + Vector((EAR_CLEARANCE,) * 3)
    hits = {}
    for style in HAIR_STYLES:
        ob = coll.all_objects[PREFIX + f"Hair_{style}"]
        count = 0
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            if inside_head(w):
                continue
            for _, c, (ex, ey, ez) in ears:
                q = w - c
                if (q.dot(ex) / h.x) ** 2 + (q.dot(ey) / h.y) ** 2 + (q.dot(ez) / h.z) ** 2 < 1:
                    count += 1
        hits[style] = count
    return hits


def seat_constants(root):
    """AVATAR_HIP_Y, AVATAR_LEG_RADIUS and AVATAR_HIP_OFFSET, read from shared/seats.ts: the seat
    anchors are derived from them, so the legs, the trouser legs and the seat are built to them
    rather than to a second copy of the numbers."""
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()

    def get(name):
        return float(re.search(rf"export const {name} = ([0-9.]+)", src).group(1))

    return get("AVATAR_HIP_Y"), get("AVATAR_LEG_RADIUS"), get("AVATAR_HIP_OFFSET")


def build(hip_y, leg_r, hip_off):
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    mat = {name: material(name) for name in PALETTE}
    origin = Vector()

    seat = TRUNK_PROFILE[0][1] - BOTTOM_OFF
    if abs(seat - (hip_y - hip_off)) > 1e-6:
        raise RuntimeError(f"the trousers' seat is at {seat:.3f}, seats expect {hip_y - hip_off:.3f} (shared/seats.ts)")

    root = empty("Root", coll)
    body = empty("Body", coll, root)
    ensure_object_mode()

    # Torso: the skin trunk, pivot at its base (the runtime scales it to breathe, and the tops,
    # its children, breathe with it)
    bm = bmesh.new()
    add_shaped(bm, 24, trunk_skin)
    torso = make_object("Torso", bm, TORSO_PIVOT, coll, body, origin, (mat["Mat_Skin"],))

    # Head: pivot at the neck base; two round ears at eye level standing out from its sides
    bm = bmesh.new()
    add_shaped(bm, 26, HEAD.point)
    for _, centre, frame in ear_frames():
        add_shaped(bm, 14, ear_shape(centre, frame))
    head = make_object("Head", bm, NECK, coll, body, origin, (mat["Mat_Skin"],))

    # Eyes: two tall dark ovals with a white glint, painted on; the pivot is on the eye line, so
    # squashing the node in y closes them toward it
    eye_line, _ = HEAD.surf(0, EYE_PITCH)
    bm = bmesh.new()
    for s in (-1, 1):
        patch(bm, HEAD.surf, s * 0.34, EYE_PITCH, 0.078, 0.112, material=0)
        patch(bm, HEAD.surf, s * 0.34 + 0.03, EYE_PITCH + 0.04, 0.026, 0.026, lift=GLINT_LIFT, material=1, rings=3, segs=16)
    make_object("Eyes", bm, eye_line, coll, head, NECK, (mat["Mat_Eye"], mat["Mat_Glint"]), closed=False)

    # Face: blush ovals and a small smile
    bm = bmesh.new()
    for s in (-1, 1):
        patch(bm, HEAD.surf, s * 0.6, -0.19, 0.11, 0.06, material=0)
    smile = [HEAD.surf(0.075 * math.cos(a), -0.2 + 0.045 * math.sin(a))[0] for a in (math.pi + math.pi * i / 32 for i in range(33))]
    stroke(bm, smile, 0.012, HEAD.project, material=1)
    # a soft blush in the hollow of each ear's cup
    for _, centre, frame in ear_frames():
        patch(bm, ear_surf(centre, frame), math.atan2(EAR_CUP_DIR.y, EAR_CUP_DIR.x), math.asin(EAR_CUP_DIR.z), 0.42, 0.5, material=0, rings=4, segs=24)
    make_object("Face", bm, NECK, coll, head, NECK, (mat["Mat_Blush"], mat["Mat_Mouth"]), closed=False)

    # Hair: one variant per style, each a clay shell (with any buns or fall fused on), all children
    # of the head; the runtime shows the player's one
    for style in HAIR_STYLES:
        fuse_clay(f"Hair_{style}", hair_parts(style), coll, head, mat["Mat_Hair"], [(mat[m], b) for m, b in HAIR_TRIMS.get(style, [])])

    # Hats: one per wardrobe hat, all children of the head, sized to sit on the hair; the runtime
    # shows the player's one (and under a hat that covers the crown, swaps buns and spikes for
    # the plain cap so nothing pokes through)
    assert tuple(HATS) == HAT_IDS
    for hat, (build_hat, names) in HATS.items():
        bm = bmesh.new()
        build_hat(bm)
        make_object(f"Hat_{hat}", bm, NECK, coll, head, NECK, [mat[n] for n in names])

    # Arms: skin, pivots at the shoulders, hanging straight down; each arm and its hand fused into
    # one form
    arms, shoulders = {}, {}
    for name, side in (("ArmL", 1), ("ArmR", -1)):
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        skin = piece(name, lambda bm, side=side: arm_skin(bm, side), mat["Mat_Skin"], shoulder, coll, fuse=ARM_FUSE)
        arms[name], shoulders[name] = assemble(name, [skin], body, shoulder, origin), shoulder

    # Mug: in the right hand, pivot at the hand so the runtime can keep it upright
    hand = Vector((shoulders["ArmR"].x, 0, HAND_Z))
    cup = hand + Vector((0, -0.07, 0.02))
    bm = bmesh.new()
    add_shaped(bm, 8, ellipsoid(cup, Vector((0.042, 0.042, 0.042)), n=5))
    handle = [cup + Vector((-0.042 - 0.022 * math.sin(a), 0, 0.022 * math.cos(a))) for a in (math.pi * i / 12 for i in range(13))]
    tube(bm, handle, lambda s: 0.009, sides=10, cap_rings=3)
    make_object("Mug", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Mug"],))

    # Legs: skin, pivots at the hips (AVATAR_LEG_RADIUS round there), tapering to the ankle, in
    # sneakers: a fused canvas upper on a thick flat sole, flush on the floor, with laces
    legs, hips = {}, {}
    for name, side in (("LegL", 1), ("LegR", -1)):
        hip = Vector((side * LEG_X, 0, hip_y))
        pieces = [
            piece(name, lambda bm, side=side: leg_skin(bm, side, hip_y, leg_r), mat["Mat_Skin"], hip, coll),
            piece(name + "_upper", lambda bm, side=side: sneaker_upper(bm, side), mat["Mat_Shoes"], hip, coll, fuse=SHOE_FUSE),
            piece(name + "_sole", lambda bm, side=side: sneaker_sole(bm, side), mat["Mat_Sole"], hip, coll),
            piece(name + "_laces", lambda bm, side=side: sneaker_laces(bm, side), mat["Mat_Sole"], hip, coll),
        ]
        legs[name], hips[name] = assemble(name, pieces, body, hip, origin), hip

    # Clothes: every top and bottom in pieces on the parts they move with (the runtime shows the
    # outfit's one of each): a top's body on the torso and its sleeves on the arms, a bottom's seat
    # on the body and its legs on the legs
    parts = {"Torso": (torso, TORSO_PIVOT, 0), "Body": (body, origin, 0), "ArmL": (arms["ArmL"], shoulders["ArmL"], 1), "ArmR": (arms["ArmR"], shoulders["ArmR"], -1), "LegL": (legs["LegL"], hips["LegL"], 1), "LegR": (legs["LegR"], hips["LegR"], -1)}
    assert tuple(TOPS) == TOP_IDS and tuple(BOTTOMS) == BOTTOM_IDS
    for kind, table, part_list, extra in (("Top", TOPS, TOP_PARTS, ()), ("Bottom", BOTTOMS, BOTTOM_PARTS, (hip_y, leg_r, hip_off))):
        for garment, (names, build_garment) in table.items():
            for suffix, parent_name in part_list:
                parent, pivot, side = parts[parent_name]
                bm = bmesh.new()
                build_garment(bm, suffix, side, *extra)
                make_object(f"{kind}_{garment}{suffix}", bm, pivot, coll, parent, pivot, [mat[n] for n in names])

    wrong = sorted(o.name for o in coll.all_objects if o.name[len(PREFIX) :] not in NODE_NAMES)
    if wrong:
        raise RuntimeError(f"name clash, rename the other objects first: {wrong}")
    bpy.context.view_layer.update()
    buried = {k: v for k, v in ear_clearance(coll).items() if v}
    if buried:
        raise RuntimeError(f"hair covers the ears (vertices within {EAR_CLEARANCE} of an ear): {buried}")
    return coll


DEFAULT_HAIR = "short"
DEFAULT_TOP = "hoodie"  # the starter hoodie outfit
DEFAULT_BOTTOM = "sweats"


def is_variant(ob):
    """A wardrobe or held-prop node the runtime shows only on demand: every hair style, top and
    bottom but the defaults, every hat, the mug."""
    name = ob.name[len(PREFIX) :]
    kind, _, rest = name.partition("_")
    default = {"Hair": DEFAULT_HAIR, "Top": DEFAULT_TOP, "Bottom": DEFAULT_BOTTOM}.get(kind)
    return (default is not None and rest.split("_")[0] != default) or kind == "Hat" or name == "Mug"


def tidy_viewport(coll):
    """Leave one clean character in Blender's viewport: the body in the default hair and outfit.
    Every other variant is disabled in the viewport but still renders, and export re-enables it."""
    for o in coll.all_objects:
        o.hide_viewport = is_variant(o)
        o.hide_render = False


def export(coll, path):
    for o in coll.all_objects:  # the exporter only sees what the viewport evaluates
        o.hide_viewport = False
    layer = bpy.context.view_layer
    layer.update()
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
            break
        except TypeError as err:  # an option this Blender's exporter does not know: drop it
            bad = next((k for k in list(kwargs) if k in str(err) and k not in ("filepath", "export_format", "export_apply", "export_yup")), None)
            if not bad:
                raise
            kwargs.pop(bad)
    strip_prefix(path)
    tidy_viewport(coll)


def strip_prefix(path):
    """Rename the GLB's nodes and meshes from "AV_Body" to "Body", and its materials from
    "Mat_Blush.001" (Mochi owns "Mat_Blush" in the same file) to "Mat_Blush": the contract's names."""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    json_len, json_type = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20 : 20 + json_len])
    rest = data[20 + json_len :]
    for key in ("nodes", "meshes"):
        for item in doc.get(key, []):
            if item.get("name", "").startswith(PREFIX):
                item["name"] = item["name"][len(PREFIX) :]
    for item in doc.get("materials", []):
        item["name"] = re.sub(r"\.\d{3}$", "", item.get("name", ""))
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    body = struct.pack("<II", len(text), json_type) + text + rest
    with open(path, "wb") as f:
        f.write(struct.pack("<III", magic, version, 12 + len(body)) + body)


def summary(coll):
    out, lo, hi = {}, Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in coll.all_objects:
        entry = {"pivot": [round(v, 4) for v in o.matrix_world.translation]}
        if o.type == "MESH":
            ws = [o.matrix_world @ v.co for v in o.data.vertices]
            mn = Vector([min(w[i] for w in ws) for i in range(3)])
            mx = Vector([max(w[i] for w in ws) for i in range(3)])
            entry["min"], entry["max"] = [round(v, 4) for v in mn], [round(v, 4) for v in mx]
            entry["tris"] = sum(len(p.vertices) - 2 for p in o.data.polygons)
            if o.name[len(PREFIX) :] in ("Torso", "Head", "Hair_cap", "ArmL", "ArmR", "LegL", "LegR"):
                lo = Vector([min(a, b) for a, b in zip(lo, mn)])
                hi = Vector([max(a, b) for a, b in zip(hi, mx)])
        out[o.name[len(PREFIX) :]] = entry
    size = hi - lo
    return {"bounds_with_cap": {"width_x": round(size.x, 4), "depth_y": round(size.y, 4), "height_z": round(size.z, 4), "min_z": round(lo.z, 5)}, "objects": out}


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_avatar.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        hip_y, leg_r, hip_off = seat_constants(root)
        coll = build(hip_y, leg_r, hip_off)
        out = os.path.join(root, "client", "public", "models", "avatar.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "hip_y": hip_y, "leg_radius": leg_r, "hip_offset": hip_off, **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
