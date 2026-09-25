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
          EyesHappy      joyful closed eyes (^ ^) on the same line, hidden until a happy moment
                         (a sip of something warm): the runtime swaps them for Eyes
          Face           blush and smile
          EarL / EarR    each ear, with the blush in its cup: its own node, so the runtime can
                         hide it under a style that covers it (rig.ts HAIR_STYLE_META)
          Hair_<style>   short, bob, curtain, ponytail, wavylong (free); hero, drill, topknot,
                         spacebuns, afro (bought): the runtime shows the player's one
            Hair_<style>_Prop   a style's raised part (the ponytail's tail, the buns, the knot),
                         hidden under a hat that covers the crown
          Hat_<id>       beret, beanie, flower, headphones, straw, tophat, bunny, crown, mochiears
        ArmL / ArmR      pivots at the shoulders, hanging straight down (the runtime splays them):
                         skin arm and hand, fused
          Top_<id>_SleeveL / _SleeveR   the top's sleeve, swinging with the arm
          Mug            in the right hand, hidden until she holds a coffee
            MugDrink     the drink filling it (Mat_Drink: the runtime tints it coffee, matcha, milk tea)
            MugTop_<id>  a topping on the drink: cream, marshmallow, cinnamon, caramel (one shown)
          WateringCan    a little can held by its top handle in the right hand, hidden until
                         she waters a plant (the runtime keeps it upright and tips it to pour)
          Skewer         a roasting stick held out of the right hand (Mat_Roast / Mat_RoastVeg are
            SkewerMallow_1..2 / SkewerBBQ_1..4   tinted raw, golden or charred): two marshmallows
                         or a BBQ skewer's meat and peppers, one node a piece so bites take them
          Hatchet        a small camp hatchet out of the right hand, its blade on the underside,
                         hidden until she chops firewood at the campfire
          Net            a little butterfly net out of the right hand, for a swipe at the fireflies
          FireflyJar     (on ArmL) a glowing glass jar of fireflies held in the left hand
          FishingRod     a bamboo pole out of the right hand, raised forward
            RodTip       an empty at its tip: the runtime runs the line from here to the Bobber
        Guitar           an acoustic guitar resting across the lap (a child of Body), hidden until
                         she plays it on a log bench
      Bobber             the red and white float (a child of Root: the runtime puts it on the water)
        LegL / LegR      pivots at the hips: skin leg and sneaker
          Bottom_<id>_LegL / _LegR      the bottom's leg, swinging and folding with the leg

The hip height and the leg radius are read out of shared/seats.ts, where the seat anchors are
derived from them: the legs are built to those numbers, so a seated avatar lands on the cushion.

Materials are the runtime's tint contract: Mat_Skin, Mat_Hair, Mat_Shirt, Mat_Pants and Mat_Accent are
recoloured per player from their look; Mat_Shoes and the face keep their own colours. The face is
painted on like Mochi's: flat sheets projected onto the head and lifted 0.002-0.004 along its
normal, flush in profile and never coplanar with it.

The ears are small soft domes at eye level, lying close along the skull, tops tipped back, their
roots flaring into it so they grow out of the head, with only a faint hollow. The hair is one
continuous clay shell grown out of the skull (`hair_shell`): fullest on the crown, grooved into
soft locks round the sides and back that sweep gently out of the whorl, creased along a parting
with the fringe swept away from it in soft rounded clumps of clay (each a fused pill-shaped
tuft), its edge rolled over like fondant. Past the fringe the side hair comes down over the
temple to the ear's root, with a soft lock in front of each ear, and behind the ear the hair drops
straight to the nape. Buns, the bob's cheek-hugging locks and the tied ponytail are fused onto the
shell;
every style then goes through the clay pipeline (join, voxel remesh, smooth, decimate: `fuse_clay`). After the build every style
is checked to keep clear of the ears (`ear_clearance`), and the build fails if one does not.

Tops and bottoms meet at one seam (SEAM_Z and its contract, beside the constants). The body is a
skin mannequin: a trunk turned on a lathe round a drawn silhouette (`TRUNK_PROFILE`),
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
MUG_TOPPINGS = ("cream", "marshmallow", "cinnamon", "caramel")
HAIR_STYLES = ("short", "bob", "curtain", "ponytail", "wavylong", "hero", "drill", "topknot", "spacebuns", "afro")
# Styles whose raised part (a tail, buns, a knot) is its own child node, Hair_<style>_Prop, which
# the runtime hides under a hat that covers the crown (rig.ts HAIR_PROP_SUFFIX)
HAIR_PROP_STYLES = ("ponytail", "topknot", "spacebuns")
HAT_IDS = ("beret", "beanie", "flower", "headphones", "straw", "tophat", "bunny", "crown", "mochiears")
TOP_IDS = ("hoodie", "tee", "flannel", "hawaiian", "tuxedo", "robe", "yukata", "jumpsuit")
BOTTOM_IDS = ("sweats", "overalls", "trousers", "shorts", "wide")
TOP_PARTS = (("", "Torso"), ("_SleeveL", "ArmL"), ("_SleeveR", "ArmR"))  # (name suffix, parent)
BOTTOM_PARTS = (("", "Body"), ("_LegL", "LegL"), ("_LegR", "LegR"))
NODE_NAMES = (
    ("Root", "Body", "Torso", "Head", "Eyes", "EyesHappy", "Face", "EarL", "EarR", "ArmL", "ArmR", "Mug", "MugDrink", "WateringCan", "Skewer", "FishingRod", "RodTip", "Guitar", "Bobber", "Hatchet", "Net", "FireflyJar", "Heart", "LegL", "LegR")
    + tuple(f"SkewerMallow_{i}" for i in (1, 2))
    + tuple(f"SkewerBBQ_{i}" for i in (1, 2, 3, 4))
    + tuple(f"MugTop_{t}" for t in MUG_TOPPINGS)
    + tuple(f"Hair_{s}" for s in HAIR_STYLES)
    + tuple(f"Hair_{s}_Prop" for s in HAIR_PROP_STYLES)
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
    "Mat_Drink": "#6B4430",  # tinted per drink by the runtime
    "Mat_Cream": "#FFF8EC",
    "Mat_Marshmallow": "#F7C6D0",
    "Mat_Cinnamon": "#8A5A3B",
    "Mat_Caramel": "#D99A3E",
    "Mat_Can": "#8EC5B8",  # the watering can: a soft mint enamel
    "Mat_CanRose": "#E3B861",  # its brass rose
    "Mat_Stick": "#C9A273",  # a green-wood roasting stick
    "Mat_Steel": "#A7AEB5",  # the hatchet's head
    "Mat_Net": "#F1ECDD",  # the firefly net's mesh
    "Mat_JarGlass": "#D8F0B0",  # the firefly jar, glowing softly from within
    "Mat_JarLid": "#C9A14A",  # its brass lid
    "Mat_JarGlow": "#F6FF9E",  # the fireflies in it
    "Mat_Heart": "#FF6F91",  # the Heart emote's heart, glowing a little
    "Mat_Roast": "#FFF4E2",  # the marshmallows / the meat: tinted raw, golden or charred by the runtime
    "Mat_RoastVeg": "#6FAE4B",  # the skewer's peppers: tinted too
    "Mat_Bamboo": "#C2AA62",
    "Mat_BambooNode": "#8C7A3E",
    "Mat_BobberRed": "#E0524A",
    "Mat_BobberWhite": "#F7F3EA",
    "Mat_GuitarWood": "#D9A066",
    "Mat_GuitarDark": "#5A3A26",
    "Mat_GuitarHole": "#2A1E17",
    "Mat_String": "#EDE6D6",
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
    if name in GLOW:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*c, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = GLOW[name]
    m.diffuse_color = (*c, 1)
    m.roughness = roughness
    m.use_backface_culling = True  # exports single-sided: every mesh is closed or a decal facing out
    return m


# materials that glow from within (the game keeps their colour out of the tone mapping)
GLOW = {"Mat_JarGlass": 0.9, "Mat_JarGlow": 2.5, "Mat_Heart": 0.8}


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

LEG_X = 0.08  # close enough that the trouser legs' hip balls stay inside the hips (check_hips)
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
    (0.0, 0.184), (0.6, 0.186), (0.9, 0.2), (1.0, 0.222), (1.07, 0.262), (1.07, 0.3), (1.03, 0.35),
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
TOP_OFF = 0.026
OUTER_OFF = 0.044
OVERALLS_OFF = TOP_OFF + 0.008  # the overalls lie flush over the tee: just 0.008 proud of it
GARMENT_IN = 0.01
# The seam contract, where every top meets every bottom:
#   - a top ends at SEAM_Z, the body's waist low on the hips, in a rolled hem (a tunic, the robe
#     and the yukata, is declared long and runs on past it);
#   - a bottom worn UNDER the top (most of them) runs from the seat up to SEAM_Z + SEAM_TUCK, just
#     far enough to disappear under the hem, SEAM_CLEARANCE inside the top, and has no waistband
#     (it would only ever be hidden);
#   - a bottom worn OVER the top (the overalls) is one continuous garment, flush over the top at
#     OVERALLS_OFF, the top's hem tucked inside it;
#   - a one-piece top (the jumpsuit) runs on down over the seat itself, belted at the seam.
SEAM_Z = 0.215
SEAM_TUCK = 0.035
SEAM_CLEARANCE = 0.012
BOTTOM_OFF = TOP_OFF - SEAM_CLEARANCE
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
# How clear of the ears every visible hair vertex of a style that leaves them showing must stay
# (checked after the build): only a hair's breadth, so the side hair can rest on the ear's root.
# A style that covers the ears (rig.ts HAIR_STYLE_META) is free to fall over them: the runtime
# hides EarL / EarR while it is worn.
EAR_CLEARANCE = 0.005

# The hair shell's soft locks round the sides and back: how many round the whole head, the yaw of
# the one they are centred on, and how far they curve round as they fall from the crown
HAIR_LOCKS = 11
HAIR_PART = 0.12
HAIR_SWEEP = 0.3
# How far the hair stands off the skull at the hairline
HAIR_RIM = 0.03
# The side hair: past the corners of the fringe it comes down over the temple to SIDE_PITCH (the
# height of the ear's top), between these yaws, so there is no bald patch between the fringe and
# the ear; over the ear itself it rests at ARCH_PITCH, on the ear's root
TEMPLE = (0.55, 1.05)
SIDE_PITCH = 0.2
ARCH_PITCH = 0.2
ARCH_WIDTH = 0.24
# Behind the ear the hair falls straight to the nape: the hairline drops from the ear's root to
# the nape between these yaws
BEHIND_EAR = (1.8, 2.25)
# The back tapers into the nape: its hairline dips to a soft point at the centre, and the hair
# thins as it comes down, so it never ends in a thick horizontal slab
NAPE_TAPER = 0.1
NAPE_THIN = 0.45
# How wide (radians from the hairline) the edge takes to roll over to the hair's full depth: a
# soft, rounded roll like the edge of rolled fondant
HAIR_LIP = 0.07
# Each style's shell:
#   fringe    the pitch of its lowest point, the yaw it is lowest at, and how fast it curves up
#             toward the temples (off centre, it sweeps to one side);
#   clumps    the fringe (and nape) as soft rounded clumps of clay, each with a pill-shaped tuft
#             fused on: how many round the whole head, and how far each clump's round end falls
#             below the creases between them (None: one clean, level trim);
#   part      a parting groove from the front hairline back toward the crown: its yaw and depth;
#             the hair swells a little on the side it is swept to (swoop);
#   notch     a small dip in the fringe at the centre; wobble, a tousled line;
#   sideburn  the soft lock in front of each ear: its yaw, half-width, how far it falls below the
#             side hair, and its shape (2: a rounded end; higher: blunter);
#   nape, crown, ends (fuller, rounded ends wherever the hair hangs low), the depth of the grooves
#   between the side and back locks, and any soft tufts grown out of it (directions, height,
#   width). Extras fused onto it are in HAIR_EXTRAS.
HAIR_DEFAULTS = dict(
    fringe=(0.34, -0.2, 0.08), clumps=None, part=None, swoop=0.0, notch=0.0, wobble=0.0, nape=-0.42,
    sideburn=(1.17, 0.2, 0.1, 2.5), side=SIDE_PITCH, arch=ARCH_PITCH, crown=0.05, ends=0.0, groove=0.3,
    tufts=None, gather=None,
)
# `gather` = (yaw, pitch, count, depth, mound): hair pulled back to a tie there, grooved in `count`
# strands converging on it, with a soft mound `mound` high where it bunches (none on the crown,
# where a hat has to sit on it).
# `side` and `arch` override SIDE_PITCH and ARCH_PITCH: a style that covers the ears takes its shell
# down over them, and its locks (HAIR_EXTRAS) fall past them.
HAIR = {
    # the Cozy Crop (the hats are fitted to its crown): a side part, the fringe swept away from it
    # in soft rounded clumps, the side hair down over the temples to the ears
    "short": dict(fringe=(0.36, 0.3, 0.07), clumps=(12, 0.06), part=(-0.5, 0.016), swoop=0.01),
    # the Layered Bob (an A-line bob): a bell of locks over the whole head and ears, longest in
    # front where they fall past the jaw and curve in toward the chin, one side-swept bang
    "bob": dict(fringe=(0.3, 0.45, 0.1), side=-0.05, arch=-0.3, nape=-0.55, sideburn=(1.17, 0.2, 0.0, 2.5), crown=0.055, groove=0.2),
    # the Curtain Shag: a centre part, curtain bangs curving out across the brow to the cheekbones,
    # and chunky rounded locks layered over a crown of ordinary height, tapering into the nape
    "curtain": dict(fringe=(0.62, 0.0, -0.75), part=(0.0, 0.016), crown=0.035, side=0.32, arch=0.32, nape=-0.42, groove=0.25),
    # the High Ponytail: pulled back from a clean hairline with a little lift at the front of the
    # crown, gathered high in a scrunchie, a wisp framing each temple
    "ponytail": dict(fringe=(0.5, 0.0, 0.1), crown=0.06, nape=-0.3, groove=0.0, sideburn=(1.17, 0.2, 0.0, 2.5), tufts=((look_dir(0.0, 0.95),), 0.018, 0.7), gather=(math.pi, 0.55, 16, 0.35, 0.014)),
    # Soft Waves (a layered V-cut): a side-swept bang, wavy locks over the ears to the shoulders,
    # and three tiers of locks cascading down the back in a V, their ends flicking out
    "wavylong": dict(fringe=(0.32, 0.4, 0.1), part=(-0.5, 0.014), side=-0.05, arch=-0.3, nape=-0.5, sideburn=(1.17, 0.2, 0.0, 2.5), crown=0.055, groove=0.2),
    # Anime Hero: broad clay clumps with soft rounded tips sweeping back off the crown, and three
    # broad bangs falling over the brow
    "hero": dict(fringe=(0.5, 0.0, 0.1), nape=-0.3, groove=0.2),
    # Twin Drills: a parted crop with two structured spiral ringlets hanging past the ears to the
    # shoulders, each tied with a bow
    "drill": dict(fringe=(0.3, 0.0, 0.07), clumps=(13, 0.05), part=(0.0, 0.01), nape=-0.45),
    # Samurai Topknot: sleek, pulled back from a clean hairline to a compact folded knot high on
    # the back of the head
    "topknot": dict(fringe=(0.42, 0.0, 0.1), crown=0.05, groove=0.0, nape=-0.32, gather=(math.pi, 1.05, 16, 0.3, 0.0)),
    # Space Buns: a centre part, soft wispy bangs, and two round dough buns on the crown's corners
    "spacebuns": dict(fringe=(0.47, 0.0, 0.12), part=(0.0, 0.014)),
    # Cloud Afro: a compact cloud of soft pillowy curls
    "afro": dict(fringe=(0.48, 0.0, 0.08), crown=0.06, nape=-0.38, groove=0.0),
}
# The clay pipeline every style goes through: the voxel size of the remesh that welds its parts
# into one form, the Smooth modifier's repeat count, and the Decimate ratio for the web
VOXEL_SIZE = 0.016  # coarse enough that every lock melts into one smooth vinyl form
SMOOTH_REPEAT = 3  # a touch more than the body's: the hair reads as smooth vinyl, not crumbly clay
DECIMATE_RATIO = 0.35


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
    each other in a rounded lip at each open edge (a hem, a neckline). v_hi may be a function of
    the angle round the body, for a garment whose top edge rises (the overalls' bib), and `off` a
    function of the height, for one that stands further out above the seam than on the seat.
    With close_lo it starts at the bottom of the seat instead, closed there (trousers)."""
    angles = [2 * math.pi * j / segs for j in range(segs)]
    top = v_hi if callable(v_hi) else (lambda a: v_hi)
    off_at = off if callable(off) else (lambda z: off)

    def ring(f, place, at_top=True):
        """The ring a fraction f of the way from v_lo up to the top edge; place(off) gives how far
        off the body it stands and how far it slides along the surface past its edge (the lips)."""
        pts = []
        for a in angles:
            v = v_lo + (top(a) - v_lo) * f
            p, n, t = trunk_frame(v)
            o, along = place(off_at(p.y))
            pts.append(lift3(p + n * o + t * (along if at_top else -along), a))
        return pts

    def lip_at(k):
        """The k-th ring round a lip, from the outer skin (k = 0) to the inner one (k = lip)."""
        th = math.pi * k / lip
        return lambda o: ((o - GARMENT_IN) / 2 + (o + GARMENT_IN) / 2 * math.cos(th), (o + GARMENT_IN) / 2 * math.sin(th))

    fs = [i / rows for i in range(rows + 1)]
    rings = [ring(f, lambda o: (o, 0.0)) for f in fs]
    rings += [ring(1.0, lip_at(k)) for k in range(1, lip)]
    rings += [ring(f, lambda o: (-GARMENT_IN, 0.0)) for f in reversed(fs)]
    if close_lo:
        seat = trunk_frame(0.0)[0]
        bottom = lambda o: lift3(seat + Vector((0, -o)), 0.0)
        stitch(bm, rings[::-1], poles=(bottom(-GARMENT_IN), bottom(off_at(seat.y))), material=material)
    else:
        rings += [ring(0.0, lip_at(k), at_top=False) for k in range(lip - 1, 0, -1)]
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


def top_body(bm, hem_z=SEAM_Z, neck=NECK_FRAC, off=TOP_OFF, material=0):
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
    # a retro-futurist jumpsuit, all one piece: the suit runs on from the collar down over the
    # seat (the trouser legs carry on below it), belted in neon accent at the seam, with a high
    # collar, a zip, a band round the chest and accent cuffs
    if part:
        return sleeve(bm, side, LONG_SLEEVE, cuff=1)
    trunk_shell(bm, 0.004, v_at_neck(NECK_FRAC), TOP_OFF, close_lo=True)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.016, 0.032)
    waist_band(bm, 0.46, TOP_OFF + 0.002, 0.006, 0.01, material=1)
    waist_band(bm, SEAM_Z + 0.02, TOP_OFF + 0.002, 0.008, 0.016, material=1)
    strip(bm, [trunk_point(v_at_z(z), front(), TOP_OFF + 0.002) for z in (0.6, 0.45, 0.3)], 0.005, material=1)


def waist(bm, off=BOTTOM_OFF, material=0):
    """The seat of a bottom worn under the top: from the bottom of the seat up to just under the
    top's hem (the seam contract), SEAM_CLEARANCE inside the top."""
    trunk_shell(bm, 0.004, v_at_z(SEAM_Z + SEAM_TUCK), off, material, close_lo=True)


def bottom_sweats(bm, part, side, hip_y, leg_r, pant_r):
    # soft sweatpants gathered into cuffs at the ankle
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.018 * smoothstep(0.02, 0.15, t), cuff=0, cuff_size=(0.012, 0.014))
    waist(bm)


OVERALLS_WAIST_Z = SEAM_Z + 0.06  # the overalls' back and sides: a little above the tee's hem
SEAT_TOP = 0.19  # the top of the seat's flat underside: where the overalls start to stand out
OVERALLS_BIB_Z = 0.475  # the bib's top edge, in front
OVERALLS_BIB_HALF = 0.46  # how far round the body the bib reaches each side of centre (radians)


def overalls_top(a):
    """The overalls' top edge at angle `a` round the body: the waist at the back and sides,
    rising in front into the bib with rounded shoulders."""
    off_front = abs((a - front() + math.pi) % (2 * math.pi) - math.pi)
    bib = 1 - smoothstep(OVERALLS_BIB_HALF - 0.1, OVERALLS_BIB_HALF + 0.55, off_front)  # a broad, gentle scoop down to the waist
    return v_at_z(OVERALLS_WAIST_Z) + (v_at_z(OVERALLS_BIB_Z) - v_at_z(OVERALLS_WAIST_Z)) * bib


def overalls_off(z):
    """How far the overalls stand off the body at height z: like any trousers on the seat (so they
    rest on a cushion), growing to OVERALLS_OFF before the tee's rolled hem, which they cover."""
    return BOTTOM_OFF + (OVERALLS_OFF - BOTTOM_OFF) * smoothstep(SEAT_TOP, SEAM_Z - 0.02, z)


def bottom_overalls(bm, part, side, hip_y, leg_r, pant_r):
    # denim overalls, worn OVER the tee as one continuous garment: the seat, the waist and the bib
    # are a single shell whose top edge rises in front into the bib (the tee tucked inside it),
    # with straps over the shoulders, brass buttons and rolled cuffs
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.012 * smoothstep(0.0, LONG_LEG, t), cuff=0, cuff_size=(0.0085, 0.011))
    trunk_shell(bm, 0.004, overalls_top, overalls_off, close_lo=True, segs=48, rows=16)
    for s in (-1, 1):
        a_front, a_back = front(s * 0.36), math.pi / 2 - s * 0.42
        over = [Vector((s * 0.088, y, 0.0)) for y in (-0.05, 0.0, 0.05)]
        pts = [trunk_point(v_at_z(z), a_front, OVERALLS_OFF) for z in (OVERALLS_BIB_Z - 0.01, 0.53, 0.58)]
        pts += [Vector((p.x, p.y, trunk_point(v_at_neck(math.hypot(p.x, p.y / TRUNK_DEPTH) / TRUNK_R[0]), 0.0, 0.0).z + OVERALLS_OFF)) for p in over]
        pts += [trunk_point(v_at_z(z), a_back, OVERALLS_OFF) for z in (0.58, 0.5, 0.4, OVERALLS_WAIST_Z - 0.01)]
        strip(bm, pts, 0.009)
        deco(bm, v_at_z(OVERALLS_BIB_Z - 0.02), front(s * 0.36), OVERALLS_OFF + 0.004, Vector((0.012, 0.007, 0.012)), material=1, cuts=4)


def bottom_trousers(bm, part, side, hip_y, leg_r, pant_r):
    # straight trousers with a waistband
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r - 0.015 * smoothstep(0.0, LONG_LEG, t))
    waist(bm)


def bottom_shorts(bm, part, side, hip_y, leg_r, pant_r):
    # loose shorts to mid-thigh
    if part:
        return pant_leg(bm, side, hip_y, leg_r, SHORT_LEG, lambda t: pant_r + 0.012 * (t / SHORT_LEG) ** 1.2)
    waist(bm)


def bottom_wide(bm, part, side, hip_y, leg_r, pant_r):
    # wide, flowing trousers that flare toward the ankle
    if part:
        return pant_leg(bm, side, hip_y, leg_r, LONG_LEG, lambda t: pant_r + 0.035 * (t / LONG_LEG) ** 1.5)
    waist(bm)


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
    "shorts": (("Mat_Pants",), bottom_shorts),
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


def lock_clumps(x):
    """A row of soft clumps along a hairline, period 2 pi in x: 1 at the bottom of each clump (a
    round, U-shaped end, like the end of a pill of clay), falling to 0 where two clumps meet in a
    soft crease. Nothing here is pointed."""
    u = (x + math.pi) % (2 * math.pi) - math.pi  # 0 at a clump's middle, +-pi at the creases
    return math.sqrt(max(0.0, 1 - (u / math.pi) ** 2))


def sideburn_lock(style, yaw):
    """0..1 across the lock in front of each ear: 1 down its middle, 0 at its sides."""
    yaw_b, width_b, _, shape_b = hair_spec(style)["sideburn"]
    x = min(1.0, abs(abs(yaw) - yaw_b) / width_b)
    return (1 - x**shape_b) ** 1.5


def hair_edge(style, yaw):
    """The hairline, as the pitch it runs at for each yaw round the head: across the brow the
    style's fringe line (lowest at one point and curving up toward the temples, perhaps tousled,
    notched, or in soft rounded clumps); past its corners the side hair comes down over the temple
    to the height of the ear's top, with a soft lock in front of each ear and the hair resting on
    the ear's root; behind the ear it drops straight to the nape, dipping to a soft point at the
    centre."""
    h = hair_spec(style)
    a = abs(yaw)
    temple = smoothstep(TEMPLE[0], TEMPLE[1], a)
    behind = smoothstep(BEHIND_EAR[0], BEHIND_EAR[1], a)  # 0 in front of the ear, 1 behind it
    low, low_yaw, curve = h["fringe"]
    front = low + curve * (yaw - low_yaw) ** 2 + h["wobble"] * math.sin(3.2 * yaw + 0.8) + h["notch"] * math.exp(-((yaw / 0.14) ** 2))
    front += (h["side"] - front) * temple
    nape = h["nape"] - NAPE_TAPER * max(0.0, -math.cos(yaw)) ** 4
    edge = front + (nape - front) * behind
    arch = math.exp(-(((a - EAR_YAW) / ARCH_WIDTH) ** 2))
    edge += (h["arch"] - edge) * arch
    lock = sideburn_lock(style, yaw)
    if h["clumps"]:
        count, depth = h["clumps"]
        edge -= depth * lock_clumps(count * yaw) * max(1 - temple, 0.7 * behind) * (1 - arch) * (1 - lock)
    return edge - h["sideburn"][2] * lock


def hair_thickness(style, yaw, pitch, d):
    """How far the hair stands off the skull: fullest on the crown, fuller over the temples, with
    fuller, rounded ends wherever it hangs low (a bob's back, a long nape); grooved into soft locks
    round the sides and back (fading out toward the crown, where they merge), and between the
    fringe's clumps, each clump swelling a little toward its round end; creased along the parting,
    swelling a little on the side it is swept to; thinning as it tapers into the nape; with any
    soft tufts grown out of it as rounded bumps."""
    h = hair_spec(style)
    t = HAIR_RIM + (h["crown"] - HAIR_RIM) * smoothstep(-0.3, 1.2, pitch)
    t += 0.012 * math.exp(-(((pitch - 0.35) / 0.35) ** 2))
    if h["ends"] or h["clumps"]:
        edge = hair_edge(style, yaw)
    if h["ends"]:
        t += h["ends"] * smoothstep(0.35, 0.0, pitch - edge) * smoothstep(0.0, -0.35, edge)
    fade = smoothstep(1.25, 0.45, pitch) * smoothstep(0.8, 1.4, abs(yaw))
    t *= 1 - h["groove"] * (1 - lock_phase(yaw, pitch)) ** 2 * fade
    back = smoothstep(0.35, 0.9, (1 - math.cos(yaw)) / 2)
    face = 1 - smoothstep(0.9, 1.5, abs(yaw))  # the front of the head, above the face
    if h["clumps"]:
        count, _ = h["clumps"]
        clump = lock_clumps(count * yaw)
        # soft creases run up from between the clumps, fading out toward the crown
        t *= 1 - 0.3 * (1 - clump) ** 2 * smoothstep(1.05, 0.4, pitch) * face
        t += 0.006 * clump * smoothstep(0.35, 0.0, pitch - edge) * face
    if h["part"]:
        part_yaw, depth = h["part"]
        side = math.sin(yaw - part_yaw)
        front_half = smoothstep(0.0, 0.5, math.cos(yaw - part_yaw))
        t -= depth * math.exp(-((side * math.cos(pitch) / 0.06) ** 2)) * smoothstep(1.4, 1.0, pitch) * front_half
        swept = -1.0 if part_yaw > 0 else 1.0  # the fringe is swept away from the parting
        t += h["swoop"] * smoothstep(0.0, 0.5, side * swept) * math.exp(-(((pitch - 0.55) / 0.3) ** 2)) * face
    t *= 1 - NAPE_THIN * smoothstep(0.15, -0.4, pitch) * back
    if h["gather"]:
        g_yaw, g_pitch, g_count, g_depth, g_mound = h["gather"]
        c = look_dir(g_yaw, g_pitch)
        ang = math.acos(max(-1.0, min(1.0, d.dot(c))))
        e1, e2 = tangents_of(c)
        ridge = 0.5 + 0.5 * math.cos(g_count * math.atan2(d.dot(e2), d.dot(e1)))
        # strands drawn taut toward the tie, their grooves fading where they bunch into it
        t *= 1 - g_depth * (1 - ridge) ** 2 * smoothstep(0.15, 0.55, ang) * smoothstep(2.6, 1.6, ang)
        t += g_mound * math.exp(-((ang / 0.4) ** 2))
    if h["tufts"]:
        dirs, height, width = h["tufts"]
        for s in dirs:
            ang = math.acos(max(-1.0, min(1.0, d.dot(s))))
            t += height * 0.5 * (1 + math.cos(math.pi * min(1.0, ang / width)))  # a soft, rounded bump
    return max(t, 0.012)


def hair_shell(bm, style):
    """The hair as one closed, thick shell: its outer skin stands hair_thickness off the skull up
    from the hairline, rolling over in a soft, rounded edge (HAIR_LIP wide) that tucks under the skin;
    its inner skin lies under the skull; the two meet along the hairline. Rows run from the edge
    up to the crown, so the edge stays a clean line however the hairline winds."""
    lip_w = HAIR_LIP
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


def fringe_tufts(style):
    """A soft pill of clay hanging down each of the fringe's clumps, from well up the forehead to
    just short of the clump's round end, lying on the shell and fused into it: the fringe reads
    as plump rolled dough rather than a flat trim."""
    count, _ = hair_spec(style)["clumps"]

    def build(bm):
        for k in range(count):
            yaw = (2 * math.pi * k / count + math.pi) % (2 * math.pi) - math.pi
            if abs(yaw) > 0.9:
                continue
            tip = hair_edge(style, yaw)
            top, n = HEAD.surf(yaw, tip + 0.2)
            end, _ = HEAD.surf(yaw, tip + 0.03)
            along = (end - top).normalized()
            across = along.cross(n).normalized()
            out = across.cross(along).normalized()
            centre = (top + end) / 2 + n * 0.02
            add_shaped(bm, 8, blob(centre, (across, out, along), Vector((0.032, 0.024, (end - top).length / 2 + 0.012))))

    return build


def round_end(s, start=0.82):
    """1 along a lock, easing to 0 over its last stretch in a quarter circle: a rounded end."""
    return math.sqrt(max(0.0, 1 - max(0.0, (s - start) / (1 - start)) ** 2))


def loft3d(bm, pts, outs, width, thick, around=18, roundness=2.2):
    """A lock of hair lofted along 3D points: each ring a soft superellipse width(s) across and
    thick(s) along its `outs` direction (the way the lock's flat face looks), s being the fraction
    of its length; both ends closed in rounded tips."""
    lengths = arc_lengths(pts)
    total = lengths[-1]
    last = len(pts) - 1
    rows = []
    for i, c in enumerate(pts):
        t = (pts[min(last, i + 1)] - pts[max(0, i - 1)]).normalized()
        across = t.cross(outs[i])
        across = (across if across.length > 1e-6 else t.orthogonal()).normalized()
        out = across.cross(t).normalized()
        if out.dot(outs[i]) < 0:
            out = -out
        s_ = lengths[i] / total
        w, th = max(width(s_), 0.002), max(thick(s_), 0.002)
        ring = []
        for j in range(around):
            a = 2 * math.pi * j / around
            ca, sa = math.cos(a), math.sin(a)
            ring.append(bm.verts.new(c + across * w * math.copysign(abs(ca) ** (2 / roundness), ca) + out * th * math.copysign(abs(sa) ** (2 / roundness), sa)))
        rows.append(ring)
    first_v = bm.verts.new(pts[0] + (pts[0] - pts[1]).normalized() * max(thick(0.0), 0.004))
    end_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * max(thick(1.0), 0.004))
    for j in range(around):
        j1 = (j + 1) % around
        bm.faces.new((first_v, rows[0][j1], rows[0][j]))
        bm.faces.new((end_v, rows[-1][j], rows[-1][j1]))
        for r0, r1 in zip(rows, rows[1:]):
            bm.faces.new((r0[j], r0[j1], r1[j1], r1[j]))


def surface_lock(bm, stations, width, thick, lift, per=8):
    """A lock lying on the head along a smooth curve through (yaw, pitch) stations, its middle
    lift(s) off the skin."""
    curve = catmull_rom(stations, per=per)
    last = len(curve) - 1
    pts, outs = [], []
    for i, st in enumerate(curve):
        q, n = HEAD.surf(st[0], st[1])
        pts.append(q + n * lift(i / last))
        outs.append(n)
    loft3d(bm, pts, outs, width, thick)


def drape_lock(bm, yaw, top, leave, z_end, width, thick, lift, curl=None, wave=0.0, phase=0.0, steps=24):
    """A lock that grows out from under the crown at pitch `top`, lies along the skull down to
    `leave` (where the head starts to curve in under it), then hangs free down to z_end, waving
    from side to side and its end curling by `curl` (a world vector: in toward the chin, or out
    in a flick)."""
    pts, outs = [], []
    for i in range(9):
        q, n = HEAD.surf(yaw, top + (leave - top) * i / 8)
        pts.append(q + n * lift)
        outs.append(n)
    start = pts[-1]
    u = Vector((math.sin(yaw), -math.cos(yaw), 0))
    across = UP.cross(u)
    drop = start.z - z_end
    for i in range(1, steps + 1):
        f = i / steps
        q = start - UP * drop * f + across * wave * math.sin(2 * math.pi * 1.3 * f + phase) * f
        if curl is not None:
            q += curl * smoothstep(0.45, 1.0, f) ** 2
        pts.append(q)
        outs.append(u)
    loft3d(bm, pts, outs, width, thick)


def wrap_yaw(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def swept_bang(stations, width=0.075):
    """One side-swept bang: a single wide, smooth lock flowing from the parting across the
    forehead, narrowing to a rounded end at the far temple."""

    def build(bm):
        surface_lock(bm, stations, width=lambda s: width * (1 - 0.35 * s) * round_end(s, 0.8), thick=lambda s: 0.024 * (1 - 0.2 * s), lift=lambda s: 0.034)

    return build


# The Layered Bob's bang, as (yaw, pitch) stations: from the side part over the crown, down across
# the forehead, to the far temple
BOB_BANG = ((-0.55, 1.05), (-0.3, 0.8), (0.0, 0.58), (0.35, 0.42), (0.7, 0.32), (0.98, 0.18))


def bob_bell(bm, count=18):
    """The Layered Bob's bell: locks all round from one cheek past the back to the other, each
    growing from under the crown and hanging just clear of the head, the whole a soft bell over the
    ears. It is an A-line: longest in front, past the jaw, where the ends curve in toward the chin;
    shorter behind, where they tuck under."""
    for k in range(count):
        yaw = wrap_yaw(0.95 + (2 * math.pi - 1.9) * k / (count - 1))
        u = Vector((math.sin(yaw), -math.cos(yaw), 0))
        front = 1 - smoothstep(1.1, 1.9, abs(yaw))
        curl = (-u + Vector((0, -1.2, 0)) * front).normalized() * (0.035 + 0.02 * front)
        z_end = 0.6 + 0.08 * smoothstep(1.3, 2.8, abs(yaw))
        drape_lock(bm, yaw, 0.85, -0.05, z_end, width=lambda s: 0.058, thick=lambda s: 0.028, lift=0.034, curl=curl)


# The Curtain Shag's bangs (the left one; the right mirrors it): from the centre part, curving out
# across the brow to the cheekbone
CURTAIN_BANG = ((0.05, 1.1), (0.1, 0.82), (0.24, 0.58), (0.46, 0.38), (0.7, 0.2), (0.88, 0.02))


def curtain_bangs(bm):
    for side in (-1, 1):
        surface_lock(bm, [(side * yaw, pitch) for yaw, pitch in CURTAIN_BANG], width=lambda s: 0.056 * (1 - 0.25 * s) * round_end(s, 0.78), thick=lambda s: 0.022, lift=lambda s: 0.03)


def shag_locks(bm, count=12):
    """The Curtain Shag's texture: chunky locks springing from the crown's whorl and sweeping back
    as they fall, each ending in a soft round tip: over the temples, resting on the ears' roots
    at the sides, and behind ending above the nape, which the shell curves smoothly into the neck."""
    for k in range(count):
        yaw0 = wrap_yaw(0.55 + (2 * math.pi - 1.1) * (k + 0.5) / count)
        a = abs(yaw0)
        end = 0.04 + 0.2 * smoothstep(0.95, 1.35, a) - 0.52 * smoothstep(1.85, 2.5, a)
        twist = math.copysign(0.28, yaw0) * (1 - smoothstep(2.6, 3.0, a))  # sweeping back, except dead behind
        stations = [(yaw0, 1.32), (yaw0 + twist * 0.3, 1.0), (yaw0 + twist * 0.65, (1.0 + end) / 2), (yaw0 + twist, end)]
        # behind, the locks stop short of the shell's nape, so the nape is one smooth curve
        surface_lock(bm, stations, width=lambda s: 0.066 * (1 - 0.3 * s) * round_end(s, 0.84), thick=lambda s: 0.024, lift=lambda s: 0.028)


# The High Ponytail: gathered high on the back of the crown (yaw, pitch). The tail's length is
# measured from its start, buried in the skull: the scrunchie sits PONY_TIE along it, where the
# gather mound narrows into the tail, and the tail splits into its two tips from PONY_SPLIT (a
# fraction of its length) on.
PONY_ROOT = (math.pi, 0.55)
PONY_TIE = 0.13
PONY_SPLIT = 0.72
X_AXIS = Vector((1, 0, 0))


def pony_path(per=10):
    """The tail's centreline (it leaves the gather at 45 degrees up, arches out and over, then
    falls in a soft S that flicks out at the end), the fraction of its length at each point, and
    the fraction where the scrunchie sits."""
    q, _ = HEAD.surf(*PONY_ROOT)
    back = Vector((0, 1, 0))
    axis = (back + UP).normalized()
    ctrl = [q - axis * 0.04, q + axis * 0.07, q + back * 0.16 + UP * 0.11, q + back * 0.25 + UP * 0.02, q + back * 0.22 - UP * 0.15, q + back * 0.27 - UP * 0.3]
    pts = catmull_rom(ctrl, per=per)
    lengths = arc_lengths(pts)
    return pts, [length / lengths[-1] for length in lengths], PONY_TIE / lengths[-1]


def pony_width(s, tie):
    """Half the tail's breadth, side to side: a cone (the gather mound) narrowing from the skull
    into the scrunchie, then a broad teardrop that swells and narrows again toward the split."""
    if s < tie:
        return 0.1 + (0.045 - 0.1) * smoothstep(0.0, 1.0, s / tie)
    return 0.045 + 0.065 * math.sin(math.pi * min(1.0, (s - tie) / (0.95 - tie)) ** 0.8)


def pony_thick(s, tie):
    """Half its depth, front to back: round in the mound, flatter than it is broad in the tail."""
    if s < tie:
        return pony_width(s, tie)
    return 0.045 - 0.006 * math.sin(math.pi * min(1.0, (s - tie) / (0.95 - tie)))


def pony_section(pts, fracs, s0, s1, lateral=lambda s: 0.0):
    """The tail's points between fractions s0 and s1, shifted `lateral` sideways, with the way its
    flat face looks (across the tail, so its breadth lies side to side)."""
    pick = [(p, f) for p, f in zip(pts, fracs) if s0 <= f <= s1]
    out_pts, outs, fs = [], [], []
    for i, (p, f) in enumerate(pick):
        t = (pick[min(len(pick) - 1, i + 1)][0] - pick[max(0, i - 1)][0]).normalized()
        out_pts.append(p + X_AXIS * lateral(f))
        outs.append(X_AXIS.cross(t))
        fs.append(f)
    return out_pts, outs, fs


def ponytail(bm):
    """The tail: a gather mound rising from the back of the crown into the scrunchie, then a broad,
    flat teardrop of hair (wide side to side, slim front to back) arching up and out and falling in
    a soft S, which splits into two overlapping chisel tips, one a little longer than the other.
    Every piece is a lofted wedge, fused into one form."""
    pts, fracs, tie = pony_path()
    body, outs, fs = pony_section(pts, fracs, 0.0, 0.86)
    loft3d(bm, body, outs, lambda s: pony_width(s * 0.86, tie) * round_end(s, 0.86), lambda s: pony_thick(s * 0.86, tie), around=24)
    for side, s1, spread in ((-1, 1.0, 0.026), (1, 0.94, 0.03)):
        tip, outs, fs = pony_section(pts, fracs, PONY_SPLIT, s1, lambda f, side=side, spread=spread: side * spread * smoothstep(PONY_SPLIT, 1.0, f))
        loft3d(bm, tip, outs, lambda s: 0.056 * (1 - s) ** 0.7 + 0.006, lambda s: 0.036 * (1 - 0.5 * s), around=18)


def ring_torus(bm, centre, axis, major, minor, ruffle=0.0, segs=48, sides=14):
    """A soft ring round `axis` (a hair tie), its tube `minor` thick, gathered into `ruffle`d
    folds like a scrunchie's fabric."""
    axis = axis.normalized()
    u = axis.orthogonal().normalized()
    v = axis.cross(u).normalized()
    rings = []
    for k in range(segs):
        th = 2 * math.pi * k / segs
        m = minor * (1 + ruffle * math.sin(9 * th))
        radial = u * math.cos(th) + v * math.sin(th)
        rings.append([bm.verts.new(centre + radial * (major + m * math.cos(ph)) + axis * m * math.sin(ph)) for ph in (2 * math.pi * j / sides for j in range(sides))])
    for k in range(segs):
        r0, r1 = rings[k], rings[(k + 1) % segs]
        for j in range(sides):
            j1 = (j + 1) % sides
            bm.faces.new((r0[j], r1[j], r1[j1], r0[j1]))


def scrunchie(bm):
    """The scrunchie: a plump, softly ruffled ring hugging the tail where the gather mound narrows
    into it, tipped 45 degrees up with the tail."""
    pts, fracs, tie = pony_path()
    i = min(range(len(fracs)), key=lambda k: abs(fracs[k] - tie))
    axis = (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
    ring_torus(bm, pts[i], axis, pony_width(tie, tie) + 0.012, 0.025, ruffle=0.16)


# a soft wisp left loose in front of each temple (the left one; the right mirrors it)
PONY_WISP = ((0.7, 0.55), (0.8, 0.3), (0.86, 0.06), (0.85, -0.16), (0.8, -0.3))


def temple_wisps(bm):
    for side in (-1, 1):
        surface_lock(bm, [(side * yaw, pitch) for yaw, pitch in PONY_WISP], width=lambda s: 0.03 * (1 - 0.4 * s) * round_end(s, 0.75), thick=lambda s: 0.017 * (1 - 0.3 * s), lift=lambda s: 0.024 - 0.006 * s)


# Soft Waves: its bang, and the three tiers down the back as (lift off the head, where the tier
# ends in the middle of the back and at its sides, wave phase): the shortest tier outermost
WAVY_BANG = ((-0.5, 1.05), (-0.25, 0.8), (0.05, 0.6), (0.38, 0.45), (0.72, 0.3), (1.0, 0.12))
WAVY_TIERS = ((0.052, 0.63, 0.7, 0.0), (0.04, 0.52, 0.64, 1.3), (0.028, 0.38, 0.58, 2.6))


def wavy_layers(bm, count=10):
    """Soft Waves' fall: wavy locks over each ear down to the shoulders, framing the face, and
    three tiers of locks cascading down the back, each longer than the one over it and longest in
    the middle, so the ends form a V. The locks keep their full width to the end, so each tier's
    fuse into one smooth hem that flicks out."""
    for side in (-1, 1):
        for i, yaw in enumerate((1.0, 1.25, 1.5, 1.75)):
            u = Vector((math.sin(side * yaw), -math.cos(side * yaw), 0))
            drape_lock(bm, side * yaw, 0.8, -0.05, 0.575 + 0.01 * i, width=lambda s: 0.06, thick=lambda s: 0.027, lift=0.034, curl=u * 0.02, wave=0.006, phase=i * 0.3)
    for lift, z_mid, z_side, phase in WAVY_TIERS:
        for k in range(count):
            yaw = wrap_yaw(2.0 + (2 * math.pi - 4.0) * k / (count - 1))
            v = abs(abs(yaw) - math.pi) / (math.pi - 2.0)  # 0 in the middle of the back, 1 at its sides
            u = Vector((math.sin(yaw), -math.cos(yaw), 0))
            drape_lock(bm, yaw, 0.9, -0.05, z_mid + (z_side - z_mid) * v**1.3, width=lambda s: 0.068, thick=lambda s: 0.028, lift=lift, curl=u * 0.03, wave=0.005, phase=phase)


# Anime Hero's clumps as (yaw, pitch where it grows, how much it lifts as it sweeps back, length,
# half-breadth at its base): big ones fanning back off the crown, smaller ones at the sides and nape
HERO_CLUMPS = (
    (0.0, 1.3, 0.5, 0.24, 0.095),
    (0.55, 1.12, 0.42, 0.22, 0.088), (-0.55, 1.12, 0.42, 0.22, 0.088),
    (1.05, 0.92, 0.28, 0.2, 0.082), (-1.05, 0.92, 0.28, 0.2, 0.082),
    (1.55, 0.72, 0.12, 0.17, 0.074), (-1.55, 0.72, 0.12, 0.17, 0.074),
    (2.2, 0.82, 0.12, 0.18, 0.078), (-2.2, 0.82, 0.12, 0.18, 0.078),
    (math.pi, 0.95, 0.22, 0.19, 0.085),
    (2.6, 0.35, -0.35, 0.15, 0.07), (-2.6, 0.35, -0.35, 0.15, 0.07), (math.pi, 0.3, -0.45, 0.15, 0.072),
)
# its bangs: broad clumps falling forward over the brow, as (yaw, pitch) stations
HERO_BANGS = (((-0.42, 1.0), (-0.45, 0.72), (-0.5, 0.42)), ((0.02, 1.05), (0.02, 0.75), (0.04, 0.38)), ((0.44, 1.0), (0.48, 0.72), (0.54, 0.44)))


def hero_clumps(bm):
    """Anime Hero: broad-based, chunky clumps of clay lying back along the head, each sweeping
    back to a soft rounded pyramid tip, fanned from the crown's apex over the sides and down the
    nape; and three broad bangs over the brow."""
    back = Vector((0, 1, 0))
    for yaw, pitch, lift, length, breadth in HERO_CLUMPS:
        q, n = HEAD.surf(yaw, pitch)
        d = (back + n * 0.25 + UP * lift * 0.5).normalized()
        p1 = q + n * 0.045
        reach = length * 0.78
        ctrl = (q - n * 0.03, p1, p1 + d * reach * 0.55, p1 + d * reach + n * 0.025)
        pts = [bezier(*ctrl, i / 24) for i in range(25)]
        loft3d(bm, pts, [n] * len(pts), lambda s, b=breadth: b * (1.08 - 0.55 * s**1.3) * round_end(s, 0.7), lambda s: 0.066 * (1 - 0.5 * s), around=20)
    for stations in HERO_BANGS:
        surface_lock(bm, stations, width=lambda s: 0.072 * (1 - 0.6 * s) * round_end(s, 0.8), thick=lambda s: 0.03 * (1 - 0.3 * s), lift=lambda s: 0.04)


# Twin Drills: where each ringlet grows (behind and above the ear), how far it falls, and its turns
DRILL_ROOT = (2.1, 0.42)
DRILL_END_Z = 0.44
DRILL_TURNS = 4.5


def drill_axis(side):
    """A ringlet's centreline: from its root on the side of the head, out past the ear and down to
    hang just outside the shoulder."""
    q, n = HEAD.surf(side * DRILL_ROOT[0], DRILL_ROOT[1])
    r0 = q + n * 0.03
    ctrl = (r0 - n * 0.02, r0 + n * 0.03 - UP * 0.1, Vector((side * 0.33, 0.12, 0.62)), Vector((side * 0.32, 0.12, DRILL_END_Z)))
    return [bezier(*ctrl, i / 60) for i in range(61)], n


def drill_curls(bm, around=32):
    """Twin Drills: two structured spiral ringlets, each a tapering cone wound with a helical step
    (every turn a soft tier over the next, the classic princess drill), ending round."""
    for side in (-1, 1):
        pts, _ = drill_axis(side)
        last = len(pts) - 1
        rows = []
        for i, c in enumerate(pts):
            s_ = i / last
            t = (pts[min(last, i + 1)] - pts[max(0, i - 1)]).normalized()
            e1 = t.orthogonal().normalized()
            e2 = t.cross(e1).normalized()
            base = (0.088 * (1 - 0.5 * s_) + 0.008) * round_end(s_, 0.9)
            ring = []
            for j in range(around):
                a = 2 * math.pi * j / around
                step = (DRILL_TURNS * s_ - side * a / (2 * math.pi)) % 1.0
                r = base * (0.62 + 0.38 * step**0.6) * smoothstep(0.0, 0.08, s_ + 0.02)
                ring.append(bm.verts.new(c + (e1 * math.cos(a) + e2 * math.sin(a)) * max(r, 0.002)))
            rows.append(ring)
        top = bm.verts.new(pts[0])
        end_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.004)
        for j in range(around):
            j1 = (j + 1) % around
            bm.faces.new((top, rows[0][j1], rows[0][j]))
            bm.faces.new((end_v, rows[-1][j], rows[-1][j1]))
            for r0, r1 in zip(rows, rows[1:]):
                bm.faces.new((r0[j], r0[j1], r1[j1], r1[j]))


def drill_bows(bm):
    """A soft ribbon bow tied at the top of each ringlet, on its outer side."""
    for side in (-1, 1):
        pts, n = drill_axis(side)
        c = pts[6] + Vector((side * 0.06, 0.0, 0.0))
        across = Vector((0, 1, 0))
        out = Vector((side, 0, 0))
        for s_ in (-1, 1):
            add_shaped(bm, 8, blob(c + across * s_ * 0.036, (across, out, UP), Vector((0.034, 0.014, 0.024))))
        add_shaped(bm, 6, blob(c + out * 0.004, AXES, Vector((0.014,) * 3)))


# Samurai Topknot: where the knot is gathered (yaw, pitch)
KNOT_ROOT = (math.pi, 1.05)


def topknot_knot(bm):
    """The knot: a broad, plump fold of hair rising from the gather high on the back of the crown,
    turning over and lying forward along the top of the head, ending round: compact and sleek."""
    q, n = HEAD.surf(*KNOT_ROOT)
    fwd = Vector((0, -1, 0))
    ctrl = [q - n * 0.03, q + n * 0.07, q + n * 0.11 + fwd * 0.04, q + n * 0.09 + fwd * 0.12, q + n * 0.06 + fwd * 0.18]
    pts = catmull_rom(ctrl, per=8)
    outs = [X_AXIS.cross((pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()) for i in range(len(pts))]
    loft3d(bm, pts, outs, lambda s: (0.078 - 0.016 * s) * round_end(s, 0.8), lambda s: 0.046 * (1 - 0.2 * s), around=22)


def topknot_band(bm):
    """The tie wound round the base of the knot."""
    q, n = HEAD.surf(*KNOT_ROOT)
    ring_torus(bm, q + n * 0.055, n, 0.068, 0.016)


# Space Buns: where each bun sits on the crown's corner (yaw, pitch), and how big it is
BUN_AT = (1.0, 0.9)
BUN_R = 0.088
BUN_STAND = 0.075


def bun_shape(centre, radius):
    """A round dough bun, faintly wound like a twisted coil of dough."""

    def shape(d):
        twist = 0.5 + 0.5 * math.cos(3 * math.atan2(d.y, d.x) + 7 * d.z)
        return centre + d * radius * (1 - 0.06 * twist)

    return shape


def space_buns(bm):
    for side in (-1, 1):
        q, n = HEAD.surf(side * BUN_AT[0], BUN_AT[1])
        add_shaped(bm, 14, bun_shape(q + n * BUN_STAND, BUN_R))


def bun_ties(bm):
    """A soft tie round the base of each bun, where it meets the head."""
    for side in (-1, 1):
        q, n = HEAD.surf(side * BUN_AT[0], BUN_AT[1])
        dist = 0.052
        ring_torus(bm, q + n * dist, n, math.sqrt(BUN_R**2 - (BUN_STAND - dist) ** 2), 0.015)


# Space Buns' wispy bangs: thin locks over the brow, as (yaw, pitch) stations
BUN_WISPS = tuple(((y, 0.78), (y * 1.1, 0.55), (y * 1.18, 0.3)) for y in (-0.42, -0.2, 0.02, 0.22, 0.42))


def brow_wisps(bm):
    for stations in BUN_WISPS:
        surface_lock(bm, stations, width=lambda s: 0.032 * (1 - 0.5 * s) * round_end(s, 0.75), thick=lambda s: 0.017, lift=lambda s: 0.03)


def cloud_puffs(bm):
    """Cloud Afro: a compact cloud of soft pillowy curls hugging the head, round puffs over the
    crown and sides, clear of the face and the ears, fused into one bubbly silhouette."""
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(64):
        z = 1 - 2 * (i + 0.5) / 64
        r = math.sqrt(1 - z * z)
        d = Vector((r * math.cos(golden * i), r * math.sin(golden * i), z))
        yaw, pitch = yaw_pitch(d)
        a = abs(yaw)
        if pitch < 0.25 or (a < 0.95 and pitch < 0.78) or (1.1 < a < 2.05 and pitch < 0.6):
            continue
        add_shaped(bm, 10, knob(yaw, pitch, 0.078 + 0.01 * math.sin(i * 1.7), 0.045))


# the parts every style adds to its shell (fused into it) and its trims (in their own material)
HAIR_EXTRAS = {
    "bob": [swept_bang(BOB_BANG), bob_bell],
    "curtain": [curtain_bangs, shag_locks],
    "ponytail": [temple_wisps],
    "wavylong": [swept_bang(WAVY_BANG), wavy_layers],
    "hero": [hero_clumps],
    "drill": [drill_curls],
    "spacebuns": [brow_wisps],
    "afro": [cloud_puffs],
}
HAIR_TRIMS = {
    "drill": [("Mat_Ribbon", drill_bows)],
}
# the raised parts that are their own node, Hair_<style>_Prop (hidden under a hat that covers the
# crown): what they are made of, and their trims
HAIR_PROPS = {
    "ponytail": ([ponytail], [("Mat_Ribbon", scrunchie)]),
    "topknot": ([topknot_knot], [("Mat_Ribbon", topknot_band)]),
    "spacebuns": ([space_buns], [("Mat_Ribbon", bun_ties)]),
}


def hair_parts(style):
    """What one hair style is made of, as bmesh builders: the shell, its fringe's tufts, then
    everything else fused onto it."""
    tufts = [fringe_tufts(style)] if hair_spec(style)["clumps"] else []
    return [lambda bm: hair_shell(bm, style)] + tufts + HAIR_EXTRAS.get(style, [])


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
# the mug's toppings: each sits on the drink's surface, `top` (the middle of it)


def mug_toppings(top):
    """{topping: (builder, materials)} for the mug's toppings, all on the drink's surface at `top`."""

    def cream(bm):
        # a soft swirl of whipped cream: three shrinking rounds and a curled tip
        for k, (r, h) in enumerate(((0.03, 0.011), (0.022, 0.01), (0.014, 0.009))):
            add_shaped(bm, 8, ellipsoid(top + Vector((0.002 * k, 0, 0.008 + 0.014 * k)), Vector((r, r, h))))
        add_shaped(bm, 6, ellipsoid(top + Vector((0.006, 0, 0.05)), Vector((0.006, 0.006, 0.01))))

    def marshmallow(bm):
        for i, (dx, dy, pink) in enumerate(((-0.014, 0.006, False), (0.012, -0.01, True), (0.004, 0.016, False), (0.016, 0.012, False))):
            add_shaped(bm, 5, ellipsoid(top + Vector((dx, dy, 0.008)), Vector((0.011, 0.011, 0.009)), n=3.2), material=1 if pink else 0)

    def cinnamon(bm):
        # a cinnamon stick leaning in the cup, and a dusting on the foam
        tube(bm, [top + Vector((-0.012, 0.004, -0.01)), top + Vector((0.014, -0.006, 0.07))], lambda s_: 0.0055, sides=10, cap_rings=2)
        for i in range(9):
            a = 2.4 * i
            r = 0.006 + 0.022 * ((i * 0.37) % 1)
            add_shaped(bm, 3, ellipsoid(top + Vector((r * math.cos(a), r * math.sin(a), 0.003)), Vector((0.004, 0.004, 0.0015))))

    def caramel(bm):
        # a small cream dome with a golden caramel drizzle zigzagging over it
        add_shaped(bm, 8, ellipsoid(top + Vector((0, 0, 0.006)), Vector((0.027, 0.027, 0.012))))
        def on_dome(x, y):
            f = max(0.0, 1 - (x / 0.027) ** 2 - (y / 0.027) ** 2)
            return top + Vector((x, y, 0.006 + 0.012 * math.sqrt(f) + 0.0015))  # resting on the cream

        zig = [on_dome(-0.02 + 0.04 * i / 24, 0.014 * math.sin(i * 1.2)) for i in range(25)]
        tube(bm, zig, lambda s_: 0.003, sides=8, cap_rings=2, material=1)

    return {
        "cream": (cream, ("Mat_Cream",)),
        "marshmallow": (marshmallow, ("Mat_Cream", "Mat_Marshmallow")),
        "cinnamon": (cinnamon, ("Mat_Cinnamon",)),
        "caramel": (caramel, ("Mat_Cream", "Mat_Caramel")),
    }


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


def hair_covering_ears(root):
    """The styles that cover the ears, read from rig.ts's HAIR_STYLE_META (the runtime hides the
    ears under them), so the two sides share one list."""
    src = open(os.path.join(root, "client", "src", "entities", "rig.ts"), encoding="utf-8").read()
    table = re.search(r"HAIR_STYLE_META:.*?= \{(.*?)\n\};", src, re.S).group(1)
    return set(re.findall(r"(\w+): \{ coversEars: true \}", table))


def ear_clearance(coll, styles):
    """The visible hair vertices of each of `styles` (those not buried in the skull) that come
    within EAR_CLEARANCE of an ear: must be none, so the ears stand clear of every style that
    leaves them showing. Each ear is tested as its whole ellipsoid in its swept frame, grown by
    EAR_CLEARANCE (the cup only takes volume away, so this is the ear's outer envelope)."""
    ears = ear_frames()
    h = EAR_HALF + Vector((EAR_CLEARANCE,) * 3)
    hits = {}
    for style in styles:
        count = 0
        for name in (f"Hair_{style}", f"Hair_{style}_Prop"):
            ob = coll.all_objects.get(PREFIX + name)
            if ob is None:
                continue
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


def check_hips(hip_y, pant_r):
    """The trouser legs start in a ball pant_r round each hip pivot (so they turn in place and sit
    flush on a cushion). Above the seam that ball must stay inside every top, all the way round
    the body, or it pokes through the shirt's sides. Returns the heights (and angles) where it
    would."""
    bad = []
    z = SEAM_Z
    while z < hip_y + pant_r:
        half = math.sqrt(max(0.0, pant_r**2 - (z - hip_y) ** 2))
        v = v_at_z(z)
        for k in range(24):
            a = 2 * math.pi * k / 24
            ball = Vector((LEG_X, 0, 0)) + Vector((math.cos(a), math.sin(a), 0)) * half
            for side in (-1, 1):
                p = Vector((side * ball.x, ball.y, z))
                top = trunk_point(v, math.atan2(p.y, p.x), TOP_OFF)
                if math.hypot(p.x, p.y) > math.hypot(top.x, top.y) - 0.002:
                    bad.append((round(z, 3), round(math.degrees(math.atan2(p.y, p.x)))))
        z += 0.005
    return bad


def seat_constants(root):
    """AVATAR_HIP_Y, AVATAR_LEG_RADIUS and AVATAR_HIP_OFFSET, read from shared/seats.ts: the seat
    anchors are derived from them, so the legs, the trouser legs and the seat are built to them
    rather than to a second copy of the numbers."""
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()

    def get(name):
        return float(re.search(rf"export const {name} = ([0-9.]+)", src).group(1))

    return get("AVATAR_HIP_Y"), get("AVATAR_LEG_RADIUS"), get("AVATAR_HIP_OFFSET")


def build(hip_y, leg_r, hip_off, covering):
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

    # Head: pivot at the neck base
    bm = bmesh.new()
    add_shaped(bm, 26, HEAD.point)
    head = make_object("Head", bm, NECK, coll, body, origin, (mat["Mat_Skin"],))

    # Ears: each its own node on the head, pivot at its centre, with a soft blush in the hollow of
    # its cup; the runtime hides them under a style that covers them
    for side, centre, frame in ear_frames():
        name = "EarL" if side > 0 else "EarR"
        skin = piece(name, lambda bm, c=centre, f=frame: add_shaped(bm, 14, ear_shape(c, f)), mat["Mat_Skin"], centre, coll)
        bm = bmesh.new()
        patch(bm, ear_surf(centre, frame), math.atan2(EAR_CUP_DIR.y, EAR_CUP_DIR.x), math.asin(EAR_CUP_DIR.z), 0.42, 0.5, material=0, rings=4, segs=24)
        blush = make_object(name + "_blush", bm, centre, coll, None, Vector(), (mat["Mat_Blush"],), closed=False)
        assemble(name, [skin, blush], head, centre, NECK)

    # Eyes: two tall dark ovals with a white glint, painted on; the pivot is on the eye line, so
    # squashing the node in y closes them toward it
    eye_line, _ = HEAD.surf(0, EYE_PITCH)
    bm = bmesh.new()
    for s in (-1, 1):
        patch(bm, HEAD.surf, s * 0.34, EYE_PITCH, 0.078, 0.112, material=0)
        patch(bm, HEAD.surf, s * 0.34 + 0.03, EYE_PITCH + 0.04, 0.026, 0.026, lift=GLINT_LIFT, material=1, rings=3, segs=16)
    make_object("Eyes", bm, eye_line, coll, head, NECK, (mat["Mat_Eye"], mat["Mat_Glint"]), closed=False)

    # EyesHappy: the same eyes squeezed shut in delight, two soft upturned arcs (^ ^) painted where
    # the ovals sit; hidden, the runtime swaps them in for a happy moment
    bm = bmesh.new()
    for s in (-1, 1):
        arc = [HEAD.surf(s * 0.34 + 0.075 * math.cos(a), EYE_PITCH - 0.03 + 0.062 * math.sin(a))[0] for a in (math.pi * i / 20 for i in range(21))]
        stroke(bm, arc, 0.024, HEAD.project, material=0)
    make_object("EyesHappy", bm, eye_line, coll, head, NECK, (mat["Mat_Eye"],), closed=False)

    # Face: blush ovals and a small smile
    bm = bmesh.new()
    for s in (-1, 1):
        patch(bm, HEAD.surf, s * 0.6, -0.19, 0.11, 0.06, material=0)
    smile = [HEAD.surf(0.075 * math.cos(a), -0.2 + 0.045 * math.sin(a))[0] for a in (math.pi + math.pi * i / 32 for i in range(33))]
    stroke(bm, smile, 0.012, HEAD.project, material=1)
    make_object("Face", bm, NECK, coll, head, NECK, (mat["Mat_Blush"], mat["Mat_Mouth"]), closed=False)

    # Hair: one variant per style, each a clay shell (with any buns or fall fused on), all children
    # of the head; the runtime shows the player's one
    assert tuple(HAIR_PROPS) == HAIR_PROP_STYLES
    for style in HAIR_STYLES:
        hair = fuse_clay(f"Hair_{style}", hair_parts(style), coll, head, mat["Mat_Hair"], [(mat[m], b) for m, b in HAIR_TRIMS.get(style, [])])
        if style in HAIR_PROPS:
            parts, trims = HAIR_PROPS[style]
            fuse_clay(f"Hair_{style}_Prop", parts, coll, hair, mat["Mat_Hair"], [(mat[m], b) for m, b in trims])

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
    mug = make_object("Mug", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Mug"],))

    # the drink filling it to the brim, and the toppings the kitchenette can put on it (the runtime
    # tints the drink and shows the one topping in the cup)
    top = cup + Vector((0, 0, 0.0415))
    bm = bmesh.new()
    add_shaped(bm, 8, ellipsoid(top, Vector((0.035, 0.035, 0.0025)), n=3))
    make_object("MugDrink", bm, hand, coll, mug, hand, (mat["Mat_Drink"],))
    for topping, (build_topping, names) in mug_toppings(top).items():
        bm = bmesh.new()
        build_topping(bm)
        make_object(f"MugTop_{topping}", bm, hand, coll, mug, hand, [mat[n] for n in names])

    # WateringCan: a little enamel can hanging from the right hand by the arched handle over its top,
    # pivot at the hand (so the runtime can keep it upright, then tip it forward to pour): a round
    # body, a spout rising forward from its base to a flared brass rose
    K = 1.4  # toy-sized, like the mug, so it reads at the room's zoom
    can = hand + Vector((0, -0.012, -0.078)) * K
    bm = bmesh.new()
    add_shaped(bm, 10, ellipsoid(can, Vector((0.05, 0.05, 0.045)) * K, n=3.2))
    arch = [can + Vector((0, 0.034 * math.cos(a), 0.04 + 0.036 * math.sin(a))) * K for a in (math.pi * i / 16 for i in range(17))]
    tube(bm, arch, lambda s_: 0.008 * K, sides=10, cap_rings=3)
    spout = [can + Vector((0, -0.03 - 0.085 * u, -0.012 + 0.07 * u * (1.2 - 0.2 * u))) * K for u in (i / 10 for i in range(11))]
    tube(bm, spout, lambda s_: (0.0105 - 0.004 * s_) * K, sides=10, cap_rings=2)
    tip = spout[-1]
    add_shaped(bm, 8, ellipsoid(tip + Vector((0, -0.01, 0.004)) * K, Vector((0.018, 0.009, 0.018)) * K, n=2.4), material=1)
    make_object("WateringCan", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Can"], mat["Mat_CanRose"]))

    # Skewer: a green-wood stick straight out of the fist, the food near its tip (the runtime keeps
    # it level, holds it into the fire, lifts it to bite; it tints the food by how it was roasted)
    fwd = Vector((0, -1, 0))
    stick_back, stick_len = hand + Vector((0, 0.05, 0.0)), 0.58
    bm = bmesh.new()
    tube(bm, [stick_back + fwd * (stick_len + 0.05) * i / 8 for i in range(9)], lambda s_: 0.008 - 0.003 * s_, sides=8, cap_rings=2)
    skewer = make_object("Skewer", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Stick"],))
    for i, d in enumerate((0.47, 0.4)):  # tip first: bites take them from the tip
        bm = bmesh.new()
        add_shaped(bm, 6, ellipsoid(hand + fwd * d, Vector((0.034, 0.03, 0.034)), n=4))
        make_object(f"SkewerMallow_{i + 1}", bm, hand, coll, skewer, hand, (mat["Mat_Roast"],))
    for i, (d, veg) in enumerate(((0.5, False), (0.43, True), (0.36, False), (0.29, True))):
        bm = bmesh.new()
        half = Vector((0.03, 0.022, 0.027)) if veg else Vector((0.033, 0.03, 0.031))
        add_shaped(bm, 5, ellipsoid(hand + fwd * d, half, n=3.0 if veg else 2.6))
        make_object(f"SkewerBBQ_{i + 1}", bm, hand, coll, skewer, hand, (mat["Mat_RoastVeg" if veg else "Mat_Roast"],))

    # Hatchet: a short handle straight out of the fist, the head at its end with the blade on the
    # underside (raised overhead and brought down, the blade leads)
    bm = bmesh.new()
    tube(bm, [hand + Vector((0, 0.04, 0)) + fwd * 0.34 * i / 6 for i in range(7)], lambda s_: 0.014 - 0.002 * s_, sides=8, cap_rings=2)
    add_shaped(bm, 6, ellipsoid(hand + fwd * 0.29 + Vector((0, 0, -0.035)), Vector((0.014, 0.04, 0.055)), n=3.2), material=1)
    make_object("Hatchet", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Stick"], mat["Mat_Steel"]))

    # Net: a short handle up and forward from the fist, a hoop at its end and a soft pouch under it
    up_fwd_net = Vector((0, -math.cos(math.radians(40)), math.sin(math.radians(40))))
    butt = hand - up_fwd_net * 0.06
    bm = bmesh.new()
    tube(bm, [butt + up_fwd_net * 0.46 * i / 8 for i in range(9)], lambda s_: 0.011 - 0.003 * s_, sides=8, cap_rings=2)
    hoop_c = butt + up_fwd_net * 0.55
    u = Vector((1, 0, 0))
    v = up_fwd_net.cross(u).normalized()
    ring = [hoop_c + (u * math.cos(a) + v * math.sin(a)) * 0.09 for a in (2 * math.pi * k / 20 for k in range(21))]
    tube(bm, ring, lambda s_: 0.007, sides=6, cap_rings=1)
    add_shaped(bm, 6, ellipsoid(hoop_c - up_fwd_net * 0.02 + Vector((0, 0, -0.055)), Vector((0.085, 0.085, 0.07)), n=2.2), material=1)
    make_object("Net", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Stick"], mat["Mat_Net"]))

    # FireflyJar: a little glass jar held out of the left fist, glowing, a brass lid and fireflies
    hand_l = Vector((shoulders["ArmL"].x, 0, HAND_Z))
    jar_c = hand_l + Vector((0, -0.035, -0.075))
    bm = bmesh.new()
    add_shaped(bm, 6, ellipsoid(jar_c, Vector((0.052, 0.052, 0.066)), n=3.4))
    add_shaped(bm, 5, ellipsoid(jar_c + Vector((0, 0, 0.07)), Vector((0.046, 0.046, 0.016)), n=3.0), material=1)
    for dx, dy, dz in ((0.03, -0.035, 0.01), (-0.035, -0.03, -0.02), (0.0, -0.05, 0.03), (-0.02, 0.035, 0.0)):
        add_shaped(bm, 3, ellipsoid(jar_c + Vector((dx, dy, dz)), Vector((0.013, 0.013, 0.013)), n=2.0), material=2)
    make_object("FireflyJar", bm, hand_l, coll, arms["ArmL"], shoulders["ArmL"], (mat["Mat_JarGlass"], mat["Mat_JarLid"], mat["Mat_JarGlow"]))

    # FishingRod: a bamboo pole raised forward from the fist, ringed at its nodes, an empty at its tip
    up_fwd = Vector((0, -math.cos(math.radians(35)), math.sin(math.radians(35))))
    rod_len = 1.05
    butt = hand - up_fwd * 0.08
    bm = bmesh.new()
    tube(bm, [butt + up_fwd * rod_len * i / 12 for i in range(13)], lambda s_: 0.014 - 0.008 * s_, sides=8, cap_rings=2)
    for k in range(1, 6):
        at = butt + up_fwd * rod_len * k / 6
        r = 0.016 - 0.008 * k / 6
        tube(bm, [at - up_fwd * 0.012, at + up_fwd * 0.012], lambda s_, r=r: r, sides=8, cap_rings=1, material=1)
    rod = make_object("FishingRod", bm, hand, coll, arms["ArmR"], shoulders["ArmR"], (mat["Mat_Bamboo"], mat["Mat_BambooNode"]))
    empty("RodTip", coll, rod, butt + up_fwd * rod_len, hand)

    # Guitar: across the lap (seated on a log), the body at her right hip, the neck rising to her
    # left; its face to the front. A child of Body, so it goes where she sits.
    tilt = math.radians(24)
    u = Vector((math.cos(tilt), 0, math.sin(tilt)))  # along the neck, to her left and up
    v = Vector((-math.sin(tilt), 0, math.cos(tilt)))  # across the body
    frame = (u, Vector((0, 1, 0)), v)
    centre = Vector((-0.08, -0.2, 0.44))
    bm = bmesh.new()
    add_shaped(bm, 8, blob(centre - u * 0.02, frame, Vector((0.105, 0.036, 0.112)), n=2.2))
    add_shaped(bm, 8, blob(centre + u * 0.12, frame, Vector((0.082, 0.034, 0.088)), n=2.2))
    tube(bm, [centre + u * 0.19 + Vector((0, -0.006, 0)), centre + u * 0.45 + Vector((0, -0.006, 0))], lambda s_: 0.017, sides=8, cap_rings=2, material=1)
    add_shaped(bm, 4, blob(centre + u * 0.5, frame, Vector((0.045, 0.016, 0.03)), n=3.0), material=1)
    for k in (-1, 1):
        for j in (0, 1):
            add_shaped(bm, 2, ellipsoid(centre + u * (0.485 + 0.03 * j) + v * k * 0.037 + Vector((0, 0.004, 0)), Vector((0.009, 0.009, 0.009))), material=1)
    add_shaped(bm, 5, blob(centre + u * 0.07 + Vector((0, -0.036, 0)), frame, Vector((0.032, 0.004, 0.032)), n=2.0), material=2)
    add_shaped(bm, 3, blob(centre - u * 0.06 + Vector((0, -0.036, 0)), frame, Vector((0.012, 0.006, 0.042)), n=4.0), material=1)
    for k in (-1.5, -0.5, 0.5, 1.5):
        a = centre - u * 0.06 + v * k * 0.009 + Vector((0, -0.042, 0))
        b = centre + u * 0.47 + v * k * 0.007 + Vector((0, -0.024, 0))
        tube(bm, [a, b], lambda s_: 0.0022, sides=4, cap_rings=1, material=3)
    make_object("Guitar", bm, centre, coll, body, origin, (mat["Mat_GuitarWood"], mat["Mat_GuitarDark"], mat["Mat_GuitarHole"], mat["Mat_String"]))

    # Bobber: a red and white float with a little mast, centred on its pivot (the runtime floats it)
    bm = bmesh.new()
    add_shaped(bm, 6, ellipsoid(Vector((0, 0, 0)), Vector((0.045, 0.045, 0.045))))
    for f in bm.faces:
        f.material_index = 1 if f.calc_center_median().z > 0.004 else 0
    tube(bm, [Vector((0, 0, 0.04)), Vector((0, 0, 0.1))], lambda s_: 0.006, sides=6, cap_rings=1, material=0)
    make_object("Bobber", bm, Vector((0, 0, 0)), coll, root, origin, (mat["Mat_BobberRed"], mat["Mat_BobberWhite"]))

    # Heart: the Heart emote's plump heart, in front of the chest (a child of Root: the runtime pops
    # it up from here, floats and spins it, then shrinks it away). Its surface is the classic
    # implicit heart, (x^2 + 9/4 y^2 + z^2 - 1)^3 = x^2 z^3 + 9/80 y^2 z^3, found along each ray.
    def heart_shape(d):
        def f(r):
            x, y, z = d.x * r, d.y * r, d.z * r
            return (x * x + 2.25 * y * y + z * z - 1) ** 3 - x * x * z ** 3 - 0.1125 * y * y * z ** 3
        lo, hi = 0.0, 1.6
        for _ in range(40):
            mid = (lo + hi) / 2
            if f(mid) < 0:
                lo = mid
            else:
                hi = mid
        return heart_c + d * (lo * 0.085)
    heart_c = Vector((0, -0.24, 0.47))
    bm = bmesh.new()
    add_shaped(bm, 8, heart_shape)
    make_object("Heart", bm, heart_c, coll, root, origin, (mat["Mat_Heart"],))

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
    poking = check_hips(hip_y, hip_off)
    if poking:
        raise RuntimeError(f"the trouser legs' hip balls poke through the tops at (z, angle): {sorted(set(poking))[:8]}")
    unknown = covering - set(HAIR_STYLES)
    if unknown:
        raise RuntimeError(f"rig.ts HAIR_STYLE_META names styles the model does not have: {sorted(unknown)}")
    buried = {k: v for k, v in ear_clearance(coll, [s for s in HAIR_STYLES if s not in covering]).items() if v}
    if buried:
        raise RuntimeError(f"hair covers the ears of a style that shows them (vertices within {EAR_CLEARANCE} of an ear): {buried}")
    return coll


DEFAULT_HAIR = "short"
DEFAULT_TOP = "hoodie"  # the starter hoodie outfit
DEFAULT_BOTTOM = "sweats"


def is_variant(ob):
    """A wardrobe or held-prop node the runtime shows only on demand: every hair style, top and
    bottom but the defaults, every hat, the mug with its drink and toppings, the watering can and
    the happy eyes."""
    name = ob.name[len(PREFIX) :]
    kind, _, rest = name.partition("_")
    default = {"Hair": DEFAULT_HAIR, "Top": DEFAULT_TOP, "Bottom": DEFAULT_BOTTOM}.get(kind)
    return (default is not None and rest.split("_")[0] != default) or kind == "Hat" or name.startswith(("Mug", "WateringCan", "EyesHappy", "Skewer", "FishingRod", "RodTip", "Guitar", "Bobber", "Hatchet", "Net", "FireflyJar", "Heart"))


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
            if o.name[len(PREFIX) :] in ("Torso", "Head", f"Hair_{DEFAULT_HAIR}", "ArmL", "ArmR", "LegL", "LegR"):
                lo = Vector([min(a, b) for a, b in zip(lo, mn)])
                hi = Vector([max(a, b) for a, b in zip(hi, mx)])
        out[o.name[len(PREFIX) :]] = entry
    size = hi - lo
    return {"bounds_with_hair": {"width_x": round(size.x, 4), "depth_y": round(size.y, 4), "height_z": round(size.z, 4), "min_z": round(lo.z, 5)}, "objects": out}


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
        coll = build(hip_y, leg_r, hip_off, hair_covering_ears(root))
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
