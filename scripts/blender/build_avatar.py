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
          Top_<id>       a top's body and collar (TOP_IDS; the runtime shows the outfit's one)
        Bottom_<id>      a bottom's seat and waist (BOTTOM_IDS)
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
        LegL / LegR      pivots at the hips: skin leg and bare foot, fused
          Bottom_<id>_LegL / _LegR      the bottom's leg and the outfit's footwear, swinging and
                         folding with the leg

The hip height and the leg radius are read out of shared/seats.ts, where the seat anchors are
derived from them: the legs are built to those numbers, so a seated avatar lands on the cushion.

Materials are the runtime's tint contract: Mat_Skin, Mat_Hair, Mat_Shirt, Mat_Pants and Mat_Accent are
recoloured per player from their look; the footwear, the metals and the face keep their own colours. The face is
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
arms fused with their hands (a slim wrist, a soft palm, a curved thumb), legs ending in bare feet.
The clothes are separate, swappable garments, each a closed,
thick shell standing a set distance off the body (BOTTOM_OFF < TOP_OFF < OUTER_OFF, so no two
surfaces ever share a depth) with its inner skin buried in it and rounded lips at its hems. A
sleeve or a trouser leg starts in a ball round its joint's pivot, which turns in place however the
joint swings, so nothing opens at a joint; a trouser leg is AVATAR_HIP_OFFSET round, so seated the
trousers rest on the cushion. Every outfit is cut to one of five archetypes (formal, robe,
streetwear, summer, workwear: see the clothes section), and its bottom's legs carry its footwear.
The hats are the wardrobe's twenty (`HATS`), each in its own colours.

Every hair style and hat is its own object under Head, every garment piece its own object on its
part. After export the Blender viewport is left tidy: only the body in the default hair (`short`)
and outfit (the hoodie and joggers) is shown; the other variants and the mug are disabled in the
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
HAT_IDS = ("beret", "beanie", "flower", "headphones", "straw", "tophat", "bunny", "crown", "mochiears", "cozybeanie", "boonie", "bearcap", "headlamp", "frogbeanie", "catbeanie", "painterberet", "buckethat", "deerstalker", "goldglasses", "pioneercap")
TOP_IDS = ("hoodie", "tee", "thermal", "chambray", "plaid", "flannel", "puffer", "sweater", "lounge", "jumpsuit", "hawaiian", "swim", "robe", "yukata", "starry", "velvet", "tuxedo", "smoking", "pinstripe")
BOTTOM_IDS = ("joggers", "cargo", "cyber", "lounge", "overalls", "garden", "blueprint", "waders", "workpants", "khakis", "board", "boxing", "yukata", "starry", "velvet", "tuxedo", "smoking", "pinstripe")
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
    + ("Hat_bearcap_EarL", "Hat_bearcap_EarR")
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
    # the campfire collection
    "Mat_CozyBeanie": "#E8742C",
    "Mat_CozyRib": "#C9591C",
    "Mat_Khaki": "#C8B48A",
    "Mat_KhakiBand": "#8C7A55",
    "Mat_BearFleece": "#8A5A3B",
    "Mat_BearInner": "#E8C9A0",
    "Mat_Elastic": "#3A3A40",
    "Mat_LampBody": "#2F3F5C",
    "Mat_LampGlow": "#FFF4C2",
    "Mat_Plaid": "#1D1B22",  # the dark bars of a buffalo check
    "Mat_Puffer": "#E0A93B",  # mustard down
    "Mat_Boot": "#4A3A2E",  # muddy wader boots
    "Mat_Mud": "#6B5236",  # splashes of river mud on them
    "Mat_Fleece": "#F1ECDD",  # the puffer's stand-up fleece collar
    # the Velvet Boutique's hats, and the Velvet Pioneer's cap
    "Mat_Frog": "#7CC46A",
    "Mat_FrogCuff": "#5E9E4E",
    "Mat_CatKnit": "#4A4550",
    "Mat_CatCuff": "#3A3540",
    "Mat_PainterBeret": "#2B3A6B",
    "Mat_Bucket": "#D9B45A",
    "Mat_BucketStitch": "#A8843A",
    "Mat_Tweed": "#8A6E4B",
    "Mat_TweedDark": "#5E4A33",
    "Mat_PioneerBeret": "#4A6F9C",
    # the wardrobe's archetypes: formal satin, metals, leathers, work boots, robes' trims
    "Mat_Satin": "#16141B",  # black satin: lapels, a shawl collar, a stripe, a sash
    "Mat_Crimson": "#B3122E",  # the tuxedo's bow tie
    "Mat_Gold": "#E2B84E",  # cufflinks, a watch chain, an obi, tassels, a crest
    "Mat_Leather": "#18161A",  # patent dress shoes and soles
    "Mat_Pin": "#B9BDC9",  # a suit's pinstripes
    "Mat_Star": "#E6EAF4",  # silver stars and constellations
    "Mat_Buckle": "#C4CAD2",  # overalls' molded metal clips, boots' speed hooks
    "Mat_WorkBoot": "#9A6434",  # tan work-boot leather
    "Mat_Lug": "#2B2622",  # lug soles and their treads, laces
    "Mat_Garden": "#5E9A4C",  # green rubber garden boots
    "Mat_Saddle": "#7A4526",  # saddle-leather suspenders
    "Mat_Suede": "#B98252",  # deck shoes
    "Mat_Wood": "#C79A63",  # geta
    "Mat_Velvet": "#5E1A2A",  # burgundy velvet slippers
}
# (metallic, roughness) for the few materials that are not matte clay
FINISH = {
    "Mat_Crown": (0.85, 0.35), "Mat_Gem": (0.0, 0.3), "Mat_Headphone": (0.2, 0.45), "Mat_Steel": (0.6, 0.4),
    "Mat_Satin": (0.0, 0.32), "Mat_Crimson": (0.0, 0.45), "Mat_Gold": (0.85, 0.3), "Mat_Leather": (0.1, 0.22),
    "Mat_Star": (0.6, 0.3), "Mat_Buckle": (0.8, 0.28), "Mat_Velvet": (0.0, 0.9),
}
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


def studio(root, call, *args):
    """The Blender studio (scripts/blender/studio.py, run fresh from disk): "begin" before the
    build (a headless run joins the master file), "finish" after the export (the collections to
    their place on the studio grid, the .blend saved). A studio failure never fails the export."""
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


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
GLOW = {"Mat_JarGlass": 0.9, "Mat_JarGlow": 2.5, "Mat_Heart": 0.8, "Mat_LampGlow": 3.0}


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
ANKLE_Z = 0.09  # where the leg meets the foot (and a sneaker's collar)
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
LEG_FUSE = (0.0055, 3, 0.3)
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
# the body under the clothes: a skin trunk, arms with hands, legs ending in bare feet


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
    each other in a rounded lip at each open edge (a hem, a neckline). v_hi (and v_lo) may be a
    function of the angle round the body, for a garment whose edge rises (the overalls' bib, a
    V-neck, a robe parting below its belt), and `off` a function of the height, for one that stands
    further out above the seam than on the seat.
    With close_lo it starts at the bottom of the seat instead, closed there (trousers)."""
    angles = [2 * math.pi * j / segs for j in range(segs)]
    top = v_hi if callable(v_hi) else (lambda a: v_hi)
    low = v_lo if callable(v_lo) else (lambda a: v_lo)
    off_at = off if callable(off) else (lambda z: off)

    def ring(f, place, at_top=True):
        """The ring a fraction f of the way from v_lo up to the top edge; place(off) gives how far
        off the body it stands and how far it slides along the surface past its edge (the lips)."""
        pts = []
        for a in angles:
            v = low(a) + (top(a) - low(a)) * f
            p, n, t = trunk_frame(v)
            o, along = place(off_at(p.y))
            pts.append(lift3(p + n * o + t * (along if at_top else -along), a))
        return pts

    def lip_at(k):
        """The k-th ring round a lip, from the outer skin (k = 0) to the inner one (k = lip)."""
        th = math.pi * k / lip
        return lambda o: ((o - GARMENT_IN) / 2 + (o + GARMENT_IN) / 2 * math.cos(th), (o + GARMENT_IN) / 2 * math.sin(th))

    fs = [i / rows for i in range(rows + 1)]
    inner = [i / max(2, rows // 3) for i in range(max(2, rows // 3) + 1)]  # buried in the body: coarser
    rings = [ring(f, lambda o: (o, 0.0)) for f in fs]
    rings += [ring(1.0, lip_at(k)) for k in range(1, lip)]
    rings += [ring(f, lambda o: (-GARMENT_IN, 0.0)) for f in reversed(inner)]
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
    an inner ball. The inner wall and ball are buried in the limb, so they are drawn coarser."""
    ro0, ri0 = r_out(0.0), r_in(0.0)
    ts = [length * k / wall for k in range(wall + 1)]
    inner = [length * k / max(2, wall // 3) for k in range(max(2, wall // 3) + 1)]
    ro, ri = r_out(length), r_in(length)
    half, mid = (ro - ri) / 2, (ro + ri) / 2
    prof = [(-ro0 * math.cos(th), ro0 * math.sin(th)) for th in (math.pi / 2 * k / cap for k in range(cap))]
    prof += [(t, r_out(t)) for t in ts]
    prof += [(length + half * math.sin(th), mid + half * math.cos(th)) for th in (math.pi * k / lip for k in range(1, lip))]
    prof += [(t, r_in(t)) for t in reversed(inner)]
    prof += [(-ri0 * math.sin(th), ri0 * math.cos(th)) for th in (math.pi / 2 * k / 2 for k in range(1, 3))]
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


# ---------------------------------------------------------------------------------------------
# clothes: every top is Top_<id> on the torso plus Top_<id>_SleeveL / _SleeveR on the arms; every
# bottom is Bottom_<id> on the body plus Bottom_<id>_LegL / _LegR on the legs, and a bottom's legs
# carry the outfit's footwear (the bare legs end in bare feet). Each piece is built in the rest
# pose's world coordinates for the part it rides on. Every outfit is cut to one of five
# archetypes, none of them built on another's base:
#   formal      a jacket over a shirt, 3D lapels standing proud of it, a bow tie or a tie, long
#               straight trousers breaking over dress shoes
#   robe        a robe down over the thighs (its skirt carried on the legs, so it walks and sits
#               with them), wide bell sleeves, a crossed or shawl collar, a thick sash knotted
#   streetwear  a hooded top, oversized sleeves gathered into ribbed cuffs, baggy joggers bunched
#               into ankle cuffs, chunky sneakers on white soles
#   summer      an open collar and a V at the throat, short sleeves cuffed at mid-bicep,
#               knee-length shorts, bare shins, deck shoes or sandals
#   workwear    overalls' thick straps on molded metal clips, deep box pockets, hammer loops,
#               rolled cuffs, lace-up work boots on lug soles


def deco(bm, v, a, off, half, material=0, roll=0.0, n=2.0, cuts=4):
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
        path += [a.lerp(b, k / 3) for k in range(3)]
    tube(bm, path + [points[-1]], lambda s: radius, sides=6, cap_rings=2, material=material)


def neck_band(bm, r_frac, off, half_r, half_z, material=0):
    """A crew-neck band: a rounded rim round the neckline where the top ends, over its lip."""
    v = v_at_neck(r_frac)
    px, py = trunk_point(v, 0.0, off), trunk_point(v, math.pi / 2, off)
    band(bm, Vector((0, 0, px.z + 0.004)), px.x, py.y, half_r, half_z, roundness=2.4, segs=44, sides=8, material=material)


def waist_band(bm, z, off, half_r, half_z, material=0):
    """A band round the trunk at height z. Under a top keep off + half_r well inside TOP_OFF (the
    band's thickness is not scaled front to back as the shells' offsets are)."""
    v = v_at_z(z)
    px, py = trunk_point(v, 0.0, off), trunk_point(v, math.pi / 2, off)
    band(bm, Vector((0, 0, z)), px.x, py.y, half_r, half_z, roundness=2.4, segs=40, sides=6, material=material)


def top_body(bm, hem_z=SEAM_Z, neck=NECK_FRAC, off=TOP_OFF, material=0):
    trunk_shell(bm, v_at_z(hem_z), v_at_neck(neck), off, material)


def sleeve(bm, side, length, material=0, loose=SLEEVE_LOOSE, flare=0.0, cuff=None, wall=9):
    """A sleeve round the arm, from a ball round the shoulder down to its cuff; `cuff` adds a band
    (its material index) round the cuff."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    r_out = lambda t: arm_radius(t) + loose + flare * (t / length) ** 2
    axis_lathe(bm, shoulder, garment_profile(r_out, lambda t: arm_radius(t) - GARMENT_IN, length, wall=wall), material=material)
    if cuff is not None:
        r = r_out(length)
        band(bm, shoulder - UP * (length - 0.006), r + 0.002, r + 0.002, 0.009, 0.011, segs=28, sides=6, material=cuff)


def pant_leg(bm, side, hip_y, leg_r, length, r_out, material=0, cuff=None, cuff_size=(0.01, 0.012), wall=9):
    """A trouser leg round the leg, from a ball round the hip (radius AVATAR_HIP_OFFSET, so seated
    it rests on the cushion) down to its cuff."""
    hip = Vector((side * LEG_X, 0, hip_y))
    axis_lathe(bm, hip, garment_profile(r_out, lambda t: leg_radius(leg_r)(t) - GARMENT_IN, length, wall=wall), material=material)
    if cuff is not None:
        r = r_out(length)
        band(bm, hip - UP * (length - 0.008), r + 0.002, r + 0.002, *cuff_size, segs=32, sides=6, material=cuff)


def front(a_off=0.0):
    """The angle round the body straight ahead, turned a_off toward her left."""
    return -math.pi / 2 + a_off


def from_front(a):
    """How far angle `a` is round the body from straight ahead (0..pi)."""
    return abs((a - front() + math.pi) % (2 * math.pi) - math.pi)


def on_trunk(a, z, off):
    """The point `off` out from the trunk at angle `a` and height z."""
    return trunk_point(v_at_z(z), a, off)


def neck_z(r_frac=NECK_FRAC):
    return trunk_frame(v_at_neck(r_frac))[0].y


def plunge(z_v, half, neck=NECK_FRAC):
    """A neckline that plunges at the front into a V: its point at height z_v, `half` radians each
    side of centre wide where it meets the collar. It is a trunk_shell's top edge; edge(z) is how
    far round from the front the V's edge is at height z (lapels and collars are laid along it)."""
    v_neck, z_n = v_at_neck(neck), neck_z(neck)

    def top(a):
        d = from_front(a)
        return v_neck if d >= half else v_at_z(z_v + (z_n - z_v) * d / half)

    top.edge = lambda z: half * max(0.0, min(1.0, (z - z_v) / (z_n - z_v)))
    top.z_v, top.z_n, top.half = z_v, z_n, half
    return top


FUSED = []  # the pieces a garment's builder asks for as fused clay forms (see `fused`)
GARMENT_FUSE = (0.007, 2, 0.28)  # (voxel size, smooth repeat, decimate ratio) for a boot, a sock
HOOD_FUSE = (0.008, 2, 0.3)
BOW_FUSE = (0.005, 2, 0.35)


def fused(build_piece, material=0, fuse=GARMENT_FUSE):
    """Build `build_piece(bm)` as its own form, voxel-fused into one seamless clay shape (a shoe's
    upper, a hood, a bow), and join it to the garment piece being built (`material`: its index in
    the garment's materials)."""
    FUSED.append((build_piece, material, fuse))


def flat_blob(centre, normal, up, half, n=2.0):
    """A blob lying flat on a surface: its thin axis along `normal`, half = (across, out, up)."""
    normal = normal.normalized()
    up = (up - normal * up.dot(normal)).normalized()
    return blob(centre, (up.cross(normal), normal, up), half, n)


def surface_band(bm, inner, outer, off_lo, off_hi, material=0, across=4, per=3):
    """A thick plate laid on the trunk between two edges, inner and outer [(angle, z)] (as many
    points each, end to end): its underside off_lo off the body, its face off_hi (a number, or a
    function of the angle and the height), closed all round. Lapels, collars, pockets, flaps."""
    hi = off_hi if callable(off_hi) else (lambda a, z: off_hi)
    ins, outs = [], []
    for (p0, p1), (q0, q1) in zip(zip(inner, inner[1:]), zip(outer, outer[1:])):
        for k in range(per):
            f = k / per
            ins.append((p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f))
            outs.append((q0[0] + (q1[0] - q0[0]) * f, q0[1] + (q1[1] - q0[1]) * f))
    ins.append(inner[-1])
    outs.append(outer[-1])
    grid = [[(a0 + (a1 - a0) * j / across, z0 + (z1 - z0) * j / across) for j in range(across + 1)] for (a0, z0), (a1, z1) in zip(ins, outs)]
    top = [[bm.verts.new(on_trunk(a, z, hi(a, z))) for a, z in row] for row in grid]
    bot = [[bm.verts.new(on_trunk(a, z, off_lo)) for a, z in row] for row in grid]
    n, m = len(grid), across + 1
    faces = []
    for i in range(n - 1):
        for j in range(m - 1):
            faces.append(bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])))
            faces.append(bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j])))
        for j in (0, m - 1):
            faces.append(bm.faces.new((top[i][j], bot[i][j], bot[i + 1][j], top[i + 1][j])))
    for i in (0, n - 1):
        for j in range(m - 1):
            faces.append(bm.faces.new((top[i][j], top[i][j + 1], bot[i][j + 1], bot[i][j])))
    for f in faces:
        f.material_index = material


def body_normal(p):
    """Out from the body's axis at p, up and out over the shoulders: a strap's surface normal."""
    return (p - Vector((0, 0, max(0.2, min(p.z, 0.5))))).normalized()


def axis_normal(cx, cy=0.0):
    """Straight out from a vertical axis (a leg's, an arm's): the normal of a strap laid round it."""
    return lambda p: Vector((p.x - cx, p.y - cy, 0.0)).normalized()


def ribbon(bm, points, width, thick, material=0, normal=body_normal, sides=8, n=4.0, steps=3):
    """A flat strap laid along `points` (on a surface): `width` across (a number, or a function of
    s = 0..1 along it), standing `thick` out from the surface, a rounded rectangle in section and
    closed at both ends. Straps, suspenders, a sash's tails, a collar's roll, a tie's blade."""
    path = []
    for a, b in zip(points, points[1:]):
        path += [a.lerp(b, k / steps) for k in range(steps)]
    path.append(points[-1])
    lengths = arc_lengths(path)
    total = lengths[-1] or 1.0
    w_at = width if callable(width) else (lambda s: width)
    rings = []
    for i, p in enumerate(path):
        t = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        nr = normal(p)
        nr = (nr - t * nr.dot(t)).normalized()
        across = t.cross(nr)
        w = max(w_at(lengths[i] / total), 2e-4) / 2
        ring = []
        for k in range(sides):
            th = 2 * math.pi * k / sides
            c, s = math.cos(th), math.sin(th)
            e = (abs(c) ** n + abs(s) ** n) ** (-1 / n)
            ring.append(bm.verts.new(p + across * (c * e * w) + nr * (thick / 2 + s * e * thick / 2)))
        rings.append((ring, p + nr * (thick / 2)))
    faces = []
    for (r0, _), (r1, _) in zip(rings, rings[1:]):
        faces += [bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k])) for k in range(sides)]
    for ring, c in (rings[0], rings[-1]):
        cv = bm.verts.new(c)
        faces += [bm.faces.new((cv, ring[(k + 1) % sides], ring[k])) for k in range(sides)]
    for f in faces:
        f.material_index = material


def star(bm, p, nrm, up, radius, thick=0.0025, material=0):
    """A little five-pointed star laid flat at p, facing `nrm`, a point toward `up`."""
    nrm = nrm.normalized()
    up = (up - nrm * up.dot(nrm)).normalized()
    across = up.cross(nrm)
    outline = []
    for k in range(10):
        th = math.pi / 2 + math.pi * k / 5
        r = radius if k % 2 == 0 else radius * 0.42
        outline.append(across * (math.cos(th) * r) + up * (math.sin(th) * r))
    top = [bm.verts.new(p + o + nrm * thick) for o in outline]
    bot = [bm.verts.new(p + o - nrm * thick * 0.5) for o in outline]
    ct, cb = bm.verts.new(p + nrm * thick * 1.4), bm.verts.new(p - nrm * thick * 0.5)
    faces = [bm.faces.new((ct, top[k], top[(k + 1) % 10])) for k in range(10)]
    faces += [bm.faces.new((cb, bot[(k + 1) % 10], bot[k])) for k in range(10)]
    faces += [bm.faces.new((top[k], bot[k], bot[(k + 1) % 10], top[(k + 1) % 10])) for k in range(10)]
    for f in faces:
        f.material_index = material


def trunk_star(bm, d, z, off, radius, material):
    """A star printed on a garment round the trunk, d round from the front at height z."""
    p, n = trunk_surf(v_at_z(z), front(d), off)
    star(bm, p, n, UP, radius, material=material)


def leg_point(side, hip_y, t, phi, r):
    """A point r out from a leg's axis, t down it from the hip, at angle phi round it (-pi/2 is
    straight ahead)."""
    return Vector((side * LEG_X + r * math.cos(phi), r * math.sin(phi), hip_y - t))


def arm_point(side, t, phi, r):
    """A point r out from an arm's axis, t down it from the shoulder, at angle phi round it."""
    return Vector((side * SHOULDER.x + r * math.cos(phi), SHOULDER.y + r * math.sin(phi), SHOULDER.z - t))


def outward(side):
    """The angle round a leg or an arm pointing away from the body."""
    return 0.0 if side > 0 else math.pi


def leg_tube(bm, side, hip_y, leg_r, z_top, z_bot, extra, material=0, flare=0.0, segs=20):
    """A closed tube round the leg from z_top down to z_bot, `extra` off the skin (a boot's shaft,
    a sock), widening by `flare` toward the bottom, its ends softly rounded."""
    hip = Vector((side * LEG_X, 0, hip_y))
    t0, t1 = hip_y - z_top, hip_y - z_bot
    leg = leg_radius(leg_r)
    r = lambda t: max(leg(t), ANKLE_R) + extra + flare * (t - t0) / (t1 - t0)
    e = min(0.006, extra)
    prof = [(t0 - e, 0.0), (t0 - e, r(t0) - e), (t0 - e * 0.3, r(t0) - e * 0.3)]
    prof += [(t0 + (t1 - t0) * k / 10, r(t0 + (t1 - t0) * k / 10)) for k in range(11)]
    prof += [(t1 + e * 0.3, r(t1) - e * 0.3), (t1 + e, r(t1) - e), (t1 + e, 0.0)]
    axis_lathe(bm, hip, prof, segs=segs, material=material)
    return r


def sleeve_stripes(bm, side, length, r_out, count, material, t0=0.025):
    """Pinstripes down a sleeve."""
    for k in range(count):
        phi = 2 * math.pi * (k + 0.5) / count
        pts = [arm_point(side, t, phi, r_out(t) + 0.0012) for t in (t0 + (length - 0.01 - t0) * i / 6 for i in range(7))]
        tube(bm, pts, lambda _: 0.0016, sides=5, cap_rings=1, material=material)


def bell_scale(bm, side, length, scale=1.25):
    """Widen a robe's sleeve across (x) into a bell: nothing at the shoulder, `scale` at the cuff."""
    cx = side * SHOULDER.x
    for v in bm.verts:
        k = max(0.0, min(1.0, (SHOULDER.z - v.co.z) / length))
        v.co.x = cx + (v.co.x - cx) * (1 + (scale - 1) * smoothstep(0.0, 1.0, k))


def bell_sleeve(bm, side, length=0.17, flare=0.05, material=0, cuff=None, scale=1.25):
    """A robe's wide bell sleeve: loose from the shoulder and flaring toward the cuff, then widened
    across by `scale` (1.25) so it hangs broad beside the body; `cuff` a band round its end."""
    sleeve(bm, side, length, material, loose=0.02, flare=flare, wall=12)
    if cuff is not None:
        r = arm_radius(length) + 0.02 + flare + 0.001
        band(bm, Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z)) - UP * (length - 0.006), r, r, 0.006, 0.009, segs=40, sides=6, material=cuff)


def bulky_sleeve(bm, side, length, bulk, material=0, cuff=None, cuff_len=0.03):
    """An oversized sleeve: roomy all the way down, then gathered into a snug ribbed cuff that it
    bunches over."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    body_end = length - cuff_len

    def r_out(t):
        roomy = arm_radius(t) + SLEEVE_LOOSE + bulk * smoothstep(0.0, 0.06, t)
        snug = arm_radius(t) + 0.012
        return roomy + (snug - roomy) * smoothstep(body_end - 0.012, body_end + 0.004, t)

    axis_lathe(bm, shoulder, garment_profile(r_out, lambda t: arm_radius(t) - GARMENT_IN, length, wall=14), material=material)
    if cuff is not None:
        for k in range(3):  # the rib's ridges
            t = body_end + 0.007 + k * (cuff_len - 0.012) / 2
            r = arm_radius(t) + 0.013
            band(bm, shoulder - UP * t, r, r, 0.0025, 0.0035, segs=24, sides=6, material=cuff)
    return r_out


def rolled_sleeve(bm, side, rolled=0.12, material=0, roll=None, loose=SLEEVE_LOOSE):
    """A long sleeve rolled up to the elbow: a fat turned-back roll at its end."""
    sleeve(bm, side, rolled, material, loose=loose)
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    r = arm_radius(rolled) + loose + 0.006
    band(bm, shoulder - UP * (rolled - 0.008), r, r, 0.011, 0.018, segs=28, sides=8, material=material if roll is None else roll)


def jogger_leg(bm, side, hip_y, leg_r, pant_r, material=0, length=0.158, bulk=0.012, taper=0.012):
    """A baggy jogger leg: roomy through the thigh, tapering down the shin into a snug ribbed ankle
    cuff that it bunches over."""
    hip = Vector((side * LEG_X, 0, hip_y))
    cuff_len = 0.026
    body_end = length - cuff_len
    leg = leg_radius(leg_r)

    def r_out(t):
        roomy = pant_r + bulk * smoothstep(0.0, 0.05, t) - taper * smoothstep(0.05, body_end, t)
        snug = leg(t) + 0.013
        return roomy + (snug - roomy) * smoothstep(body_end - 0.014, body_end + 0.004, t)

    axis_lathe(bm, hip, garment_profile(r_out, lambda t: leg(t) - GARMENT_IN, length, wall=14), material=material)
    for k in range(3):
        t = body_end + 0.006 + k * (cuff_len - 0.01) / 2
        r = leg(t) + 0.014
        band(bm, hip - UP * t, r, r, 0.0025, 0.0035, segs=24, sides=6, material=material)
    return r_out


def robe_skirt(bm, side, hip_y, leg_r, pant_r, length, flare, material=0, hem=None, edge=None):
    """A robe's skirt round the leg (each leg carries its half, so it walks and sits with it): from
    the hip, under the robe's body, flaring out to a hem `length` down; `hem` a turned band round
    it, and on her right leg `edge` the over-panel's edge running down the front: the wrap."""
    hip = Vector((side * LEG_X, 0, hip_y))
    r_out = lambda t: pant_r + flare * smoothstep(0.05, length, t) ** 0.9
    axis_lathe(bm, hip, garment_profile(r_out, lambda t: leg_radius(leg_r)(t) - GARMENT_IN, length, wall=12), material=material)
    if hem is not None:
        r = r_out(length) + 0.001
        band(bm, hip - UP * (length - 0.006), r, r, 0.005, 0.008, segs=40, sides=6, material=hem)
    if edge is not None and side < 0:
        phi = -math.pi / 2 + 0.55  # the front, turned in toward her left leg
        pts = [leg_point(side, hip_y, t, phi, r_out(t) + 0.0015) for t in (0.075, 0.11, 0.15, length - 0.006) if t <= length - 0.006]
        ribbon(bm, pts, 0.012, 0.004, edge, normal=axis_normal(side * LEG_X))
    return r_out


def dress_trouser_leg(bm, side, hip_y, leg_r, pant_r, material=0, crease=True, length=0.2):
    """A long, straight trouser leg down to the shoe, where it breaks over the vamp; a pressed
    crease down its front."""
    r_out = lambda t: pant_r - 0.021 * smoothstep(0.0, 0.13, t)
    pant_leg(bm, side, hip_y, leg_r, length, r_out, material, wall=12)
    if crease:
        pts = [leg_point(side, hip_y, t, -math.pi / 2, r_out(t)) for t in (0.03, 0.09, 0.15, length - 0.012)]
        ribbon(bm, pts, 0.006, 0.003, material, normal=axis_normal(side * LEG_X))
    return r_out


# ---------------------------------------------------------------------------------------------
# footwear: every bottom's legs carry its shoes; the bare leg ends in a bare foot


FOOT_FLOOR = 0.026  # the bare foot's sole: every sandal's footbed is this thick


def foot_skin(bm, side):
    """A soft bare foot at the end of the leg, its sole flat at FOOT_FLOOR: sandals and geta are
    built under it, every shoe and boot round it."""
    x = side * LEG_X
    add_shaped(bm, 10, floored(blob(Vector((x, -0.024, 0.047)), AXES, Vector((0.04, 0.07, 0.026)), n=2.2), FOOT_FLOOR))
    add_shaped(bm, 8, floored(blob(Vector((x, -0.074, 0.043)), AXES, Vector((0.038, 0.028, 0.019))), FOOT_FLOOR))


def sneaker_upper(bm, side, hip_y, leg_r, high=False):
    """The sneaker's canvas: a rounded toe box, a heel that rises round the ankle, and a padded
    collar round the ankle (a high-top's carried up round the shin). Fused into one form."""
    x = side * LEG_X
    add_shaped(bm, 14, floored(blob(Vector((x, -0.035, 0.05)), AXES, Vector((0.064, 0.096, 0.046)), n=2.2), SOLE_TOP - 0.004))
    add_shaped(bm, 12, floored(blob(Vector((x, 0.02, 0.064)), AXES, Vector((0.058, 0.052, 0.05))), SOLE_TOP - 0.004))
    if high:
        r = leg_tube(bm, side, hip_y, leg_r, 0.17, 0.05, 0.013)
        band(bm, Vector((x, 0, 0.166)), r(hip_y - 0.166) + 0.004, r(hip_y - 0.166) + 0.004, 0.012, 0.012, roundness=2.2, segs=48, sides=10)
    else:
        band(bm, Vector((x, 0.012, 0.106)), 0.062, 0.06, 0.013, 0.012, roundness=2.2, segs=48, sides=10)


def sneakers(bm, side, hip_y, leg_r, upper, sole, lace, high=False, stripe=None):
    """Canvas sneakers on thick white rubber soles, laced; a high-top's canvas up round the ankle;
    `stripe` a coloured band round the sole."""
    x = side * LEG_X
    fused(lambda b: sneaker_upper(b, side, hip_y, leg_r, high), upper, fuse=(0.006, 2, 0.28))
    add_shaped(bm, 5, slab(Vector((x, -0.028, SOLE_TOP / 2)), 0.071, 0.112, SOLE_TOP / 2), material=sole)
    for y in (-0.062, -0.041, -0.02):
        z = 0.05 + 0.046 * math.sqrt(max(0.0, 1 - ((y + 0.035) / 0.096) ** 2)) + 0.002
        slope = -math.atan(0.046 * ((y + 0.035) / 0.096**2) / math.sqrt(max(1e-4, 1 - ((y + 0.035) / 0.096) ** 2)))
        c, s = math.cos(slope), math.sin(slope)
        add_shaped(bm, 2, blob(Vector((x, y, z)), (Vector((1, 0, 0)), Vector((0, c, s)), Vector((0, -s, c))), Vector((0.027, 0.006, 0.005))), material=lace)
    if stripe is not None:
        add_shaped(bm, 5, slab(Vector((x, -0.028, SOLE_TOP * 0.55)), 0.0735, 0.1145, 0.0042), material=stripe)


def dress_shoes(bm, side, leather, sole, cap=None, crest=None, slipper=False):
    """Dress shoes: a long, low, glossy upper on a thin welted sole with a stacked heel. `cap` a
    contrasting wing-tip toe and heel counter (a spectator); `slipper` a velvet Albert slipper's
    lower, rounder cut, with `crest` embroidered in gold on its vamp."""
    x = side * LEG_X
    h = 0.033 if slipper else 0.036

    def upper(b):
        add_shaped(b, 12, floored(blob(Vector((x, -0.044, 0.042)), AXES, Vector((0.05, 0.097, h)), n=2.3), 0.011))
        add_shaped(b, 10, floored(blob(Vector((x, 0.016, 0.048)), AXES, Vector((0.047, 0.047, h + 0.002))), 0.011))

    fused(upper, leather, fuse=(0.0055, 2, 0.3))
    add_shaped(bm, 5, slab(Vector((x, -0.036, 0.0062)), 0.054, 0.118, 0.0062), material=sole)
    add_shaped(bm, 4, slab(Vector((x, 0.034, 0.0105)), 0.045, 0.034, 0.0105), material=sole)
    if cap is not None:
        add_shaped(bm, 6, floored(blob(Vector((x, -0.096, 0.036)), AXES, Vector((0.0485, 0.05, 0.03)), n=2.3), 0.011), material=cap)
        add_shaped(bm, 6, floored(blob(Vector((x, 0.03, 0.044)), AXES, Vector((0.0475, 0.034, 0.033))), 0.011), material=cap)
    if crest is not None:
        vamp = Vector((x, -0.07, 0.042 + h * math.sqrt(1 - (0.026 / 0.097) ** 2)))
        add_shaped(bm, 4, flat_blob(vamp, Vector((0, -0.35, 0.94)), Vector((0, 1, 0.35)), Vector((0.014, 0.003, 0.012)), n=2.4), material=crest)


def work_boots(bm, side, hip_y, leg_r, leather, sole, lace, hooks, top_z=0.15, lugs=16):
    """Rugged lace-up work boots: a bulbous toe box and a shaft up past the ankle fused into one
    form with a padded collar, on a chunky sole whose lug treads stand out all round it, laced up
    the front through metal speed hooks."""
    x = side * LEG_X
    r_top = max(leg_radius(leg_r)(hip_y - top_z), ANKLE_R) + 0.016

    def upper(b):
        add_shaped(b, 12, floored(blob(Vector((x, -0.046, 0.058)), AXES, Vector((0.066, 0.098, 0.048)), n=2.2), 0.028))
        leg_tube(b, side, hip_y, leg_r, top_z, 0.03, 0.016)
        band(b, Vector((x, 0, top_z - 0.004)), r_top + 0.004, r_top + 0.004, 0.009, 0.01, roundness=2.2, segs=40, sides=8)

    fused(upper, leather)
    add_shaped(bm, 6, slab(Vector((x, -0.034, 0.015)), 0.074, 0.122, 0.015), material=sole)
    for k in range(lugs):  # the lug treads, standing out round the sole's rim
        th = 2 * math.pi * (k + 0.5) / lugs
        c, s = math.cos(th), math.sin(th)
        kp = (abs(c) ** 2.4 + abs(s) ** 2.4) ** (-1 / 2.4)
        p = Vector((x + 0.074 * c * kp, -0.034 + 0.122 * s * kp, 0.011))
        add_shaped(bm, 1, blob(p, (Vector((-s, c, 0)), Vector((c, s, 0)), UP), Vector((0.009, 0.0065, 0.0095)), n=4.0), material=sole)
    leg = leg_radius(leg_r)
    for k in range(3):  # criss-cross laces and the speed hooks they wind round
        z0, z1 = 0.092 + 0.018 * k, 0.11 + 0.018 * k
        R0, R1 = max(leg(hip_y - z0), ANKLE_R) + 0.018, max(leg(hip_y - z1), ANKLE_R) + 0.018
        for s in (-1, 1):
            tube(bm, [leg_point(side, hip_y, hip_y - z0, -math.pi / 2 - s * 0.4, R0), leg_point(side, hip_y, hip_y - z1, -math.pi / 2 + s * 0.4, R1)], lambda _: 0.0032, sides=5, cap_rings=1, material=lace)
            add_shaped(bm, 1, ellipsoid(leg_point(side, hip_y, hip_y - z1, -math.pi / 2 + s * 0.46, R1 + 0.002), Vector((0.0045, 0.0045, 0.0045))), material=hooks)


def boxing_boots(bm, side, hip_y, leg_r, boot, sole, lace, stripe):
    """Tall, slim boxing boots laced up to the calf, a band of gold round the top, thin soles."""
    x = side * LEG_X
    top_z = 0.215
    r = lambda z: max(leg_radius(leg_r)(hip_y - z), ANKLE_R) + 0.012

    def upper(b):
        add_shaped(b, 12, floored(blob(Vector((x, -0.036, 0.047)), AXES, Vector((0.056, 0.094, 0.038)), n=2.2), 0.012))
        leg_tube(b, side, hip_y, leg_r, top_z, 0.012, 0.012)

    fused(upper, boot)
    add_shaped(bm, 8, slab(Vector((x, -0.03, 0.006)), 0.06, 0.116, 0.006), material=sole)
    band(bm, Vector((x, 0, top_z - 0.012)), r(top_z - 0.012) + 0.002, r(top_z - 0.012) + 0.002, 0.004, 0.009, segs=32, sides=6, material=stripe)
    for k in range(5):
        z0, z1 = 0.085 + 0.024 * k, 0.103 + 0.024 * k
        for s in (-1, 1):
            tube(bm, [leg_point(side, hip_y, hip_y - z0, -math.pi / 2 - s * 0.38, r(z0) + 0.0015), leg_point(side, hip_y, hip_y - z1, -math.pi / 2 + s * 0.38, r(z1) + 0.0015)], lambda _: 0.0028, sides=5, cap_rings=1, material=lace)


def boat_shoes(bm, side, upper, sole, lace):
    """Deck shoes: a soft moccasin upper on a thin white sole, rawhide lacing round the collar and
    a little bow on the outside."""
    x = side * LEG_X

    def body(b):
        add_shaped(b, 12, floored(blob(Vector((x, -0.042, 0.046)), AXES, Vector((0.054, 0.098, 0.034)), n=2.3), 0.016))
        add_shaped(b, 10, floored(blob(Vector((x, 0.018, 0.047)), AXES, Vector((0.05, 0.046, 0.031))), 0.016))

    fused(body, upper)
    add_shaped(bm, 8, slab(Vector((x, -0.034, 0.009)), 0.058, 0.121, 0.009), material=sole)
    band(bm, Vector((x, -0.035, 0.062)), 0.05, 0.094, 0.0032, 0.0032, roundness=2.0, segs=48, sides=6, material=lace)
    knot = Vector((x + side * 0.05, -0.005, 0.066))
    for dy in (-0.01, 0.01):
        add_shaped(bm, 3, blob(knot + Vector((side * 0.004, dy, 0)), AXES, Vector((0.004, 0.009, 0.005))), material=lace)


def thong_strap(bm, side, material, lift=0.0, radius=0.0065):
    """A sandal's thong: a post between the toes and a strap over each side of the foot."""
    x = side * LEG_X
    post = Vector((x - side * 0.006, -0.088, FOOT_FLOOR + lift + 0.03))
    tube(bm, [post - Vector((0, 0, 0.032)), post], lambda _: 0.0045, sides=6, cap_rings=1, material=material)
    for s in (-1, 1):
        tube(bm, quad_bezier(post, Vector((x + s * 0.03, -0.062, 0.088 + lift)), Vector((x + s * 0.046, -0.022, FOOT_FLOOR + lift + 0.004))), lambda _: radius, sides=8, cap_rings=2, material=material)
    return post


def flip_flops(bm, side, sole, strap):
    """Beach flip-flops: a thick foam footbed under the bare foot and a thong strap."""
    add_shaped(bm, 8, slab(Vector((side * LEG_X, -0.03, FOOT_FLOOR / 2)), 0.05, 0.112, FOOT_FLOOR / 2, n_plan=2.2), material=sole)
    thong_strap(bm, side, strap)


def geta(bm, side, wood, strap, knot=None):
    """Wooden geta: a flat board on two teeth under the bare foot and a cloth thong strap (hanao),
    knotted at the toe."""
    x = side * LEG_X
    add_shaped(bm, 8, slab(Vector((x, -0.03, 0.02)), 0.05, 0.108, 0.006, n_plan=4.0), material=wood)
    for y in (-0.086, 0.03):
        add_shaped(bm, 6, slab(Vector((x, y, 0.0075)), 0.046, 0.011, 0.0075, n_plan=6.0), material=wood)
    post = thong_strap(bm, side, strap, radius=0.007)
    add_shaped(bm, 4, ellipsoid(post, Vector((0.009, 0.009, 0.008))), material=strap if knot is None else knot)


def slides(bm, side, sole, strap):
    """Pool slides: a thick white footbed and one broad strap over the instep."""
    x = side * LEG_X
    add_shaped(bm, 8, slab(Vector((x, -0.03, FOOT_FLOOR / 2)), 0.056, 0.116, FOOT_FLOOR / 2), material=sole)
    arch = [Vector((x + 0.064 * math.cos(a), -0.045, FOOT_FLOOR + 0.058 * math.sin(a))) for a in (math.pi * k / 10 for k in range(11))]
    ribbon(bm, arch, 0.05, 0.012, strap, normal=lambda p: (p - Vector((x, p.y, FOOT_FLOOR))).normalized())


def socks(bm, side, hip_y, leg_r, top_z=0.13):
    """Cosy socks: the foot a little plumper, the leg up to top_z (built to be fused)."""
    x = side * LEG_X
    add_shaped(bm, 10, floored(blob(Vector((x, -0.024, 0.048)), AXES, Vector((0.046, 0.076, 0.031)), n=2.2), FOOT_FLOOR))
    add_shaped(bm, 8, floored(blob(Vector((x, -0.074, 0.044)), AXES, Vector((0.044, 0.034, 0.024))), FOOT_FLOOR))
    leg_tube(bm, side, hip_y, leg_r, top_z, 0.045, 0.007)


# ---------------------------------------------------------------------------------------------
# the five archetypes' pieces


def waist(bm, off=BOTTOM_OFF, material=0):
    """The seat of a bottom worn under the top: from the bottom of the seat up to just under the
    top's hem (the seam contract), SEAM_CLEARANCE inside the top."""
    trunk_shell(bm, 0.004, v_at_z(SEAM_Z + SEAM_TUCK), off, material, close_lo=True)


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


def jacket_off(z):
    """A tailored jacket's stand-off: OUTER_OFF, a touch fuller over the hips."""
    return OUTER_OFF + 0.006 * (1 - smoothstep(0.2, 0.3, z))


def robe_off(z):
    """A robe's stand-off: loose, flaring out below the sash."""
    return TOP_OFF + 0.006 + 0.02 * (1 - smoothstep(0.19, 0.3, z))


def formal_jacket(bm, v, hem_z=0.2, material=0):
    """A tailored jacket over the shirt, open in a V at the front down to its button."""
    trunk_shell(bm, v_at_z(hem_z), v, jacket_off, material, segs=48, rows=12)


def dress_shirt(bm, material, lo_z=0.3):
    """The shirt inside a jacket: from under the jacket up to a stand collar round the neck."""
    trunk_shell(bm, v_at_z(lo_z), v_at_neck(NECK_FRAC), TOP_OFF, material, segs=40, rows=10)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.008, 0.012, 0.022, material=material)


def lapels(bm, v, material, peak=True, width=0.17, roll=TOP_OFF + 0.04, low=OUTER_OFF - 0.006, quilt=None, piping=None, collar=True):
    """Two 3D lapels folded back along the V from its point to the collar: solid plates standing up
    to `roll` off the body (0.04 m proud of the shirt beneath), rolled highest along the V. Peaked,
    their points rising up and out under the collar, or a shawl's smooth roll; `quilt` studs a
    quilted shawl with stitched diamonds, `piping` edges it; `collar` carries the roll on round the
    back of the neck."""
    rows = []
    for i in range(11):
        u = i / 10
        z = v.z_v + (v.z_n - v.z_v) * u
        d = max(0.0, v.edge(z) - 0.02)
        if peak:
            if u <= 0.7:
                w, dz = 0.02 + (width - 0.02) * smoothstep(0.0, 0.7, u), 0.0
            elif u <= 0.8:
                w, dz = width * 1.45, 0.028  # the peak's point
            elif u <= 0.9:
                w, dz = width * 0.75, -0.004  # the notch under it
            else:
                w, dz = width * 0.55, 0.0
        else:
            w, dz = 0.02 + (width - 0.02) * math.sin(math.pi / 2 * min(1.0, u / 0.75)), 0.0
        rows.append((d, z, w, dz))
    hi = lambda a, z: roll - 0.012 * smoothstep(0.0, 1.0, (from_front(a) - v.edge(z)) / width)
    for s in (-1, 1):
        inner = [(front(s * d), z) for d, z, w, dz in rows]
        outer = [(front(s * (d + w)), z + dz) for d, z, w, dz in rows]
        surface_band(bm, inner, outer, low, hi, material, across=4, per=2)
        if piping is not None:
            tube(bm, [on_trunk(a, z, hi(a, z) - 0.002) for a, z in outer], lambda _: 0.0045, sides=6, cap_rings=1, material=piping)
        if quilt is not None:
            for d, z, w, dz in rows[1:-1:2]:
                for f in (0.3, 0.7):
                    a = front(s * (d + w * f))
                    p, n = trunk_surf(v_at_z(z), a, hi(a, z))
                    add_shaped(bm, 1, flat_blob(p, n, UP, Vector((0.0085, 0.0035, 0.0085)), n=1.3), material=quilt)
    if collar:
        d0 = v.half - 0.05
        back = [on_trunk(front(d0 + (2 * math.pi - 2 * d0) * k / 12), v.z_n + 0.004, low + 0.002) for k in range(13)]
        ribbon(bm, back, 0.036, 0.011, material)


def hood(material, lining=None, grow=0.0):
    """A hood down on the back, fused into one clay form: its opening a thick rolled rim round the
    neck, dipping in front where the drawstrings come out, the hood itself a soft pouch lying on the
    upper back. `grow` sets it further out (over a puffy vest)."""
    th = 0.35

    def build(b):
        frame = (Vector((1, 0, 0)), Vector((0, math.cos(th), math.sin(th))), Vector((0, -math.sin(th), math.cos(th))))
        add_shaped(b, 12, blob(Vector((0, 0.19 + grow, 0.525)), frame, Vector((0.125 + grow, 0.045, 0.09)), n=2.3))
        band(b, Vector((0, -0.008 + grow * 0.3, 0.585)), 0.152 + grow, 0.158 + grow, 0.024, 0.028, roundness=2.4, tilt=0.12, segs=56, sides=10)

    fused(build, material, fuse=HOOD_FUSE)


def drawstrings(bm, off, material, tip):
    for s in (-1, 1):
        a = front(s * 0.2)
        pts = [on_trunk(a, z, off) for z in (0.556, 0.51, 0.46)]
        strip(bm, pts, 0.0055, material=material)
        add_shaped(bm, 4, ellipsoid(pts[-1] - UP * 0.01, Vector((0.0075, 0.0075, 0.013))), material=tip)


def kangaroo_pocket(bm, off, material, z_lo=0.24, z_hi=0.36):
    """A hoodie's pouch pocket: a 3D pouch across the belly, its hand openings slanting in."""
    inner = [(front(-0.5), z_lo), (front(-0.42), (z_lo + z_hi) / 2), (front(-0.3), z_hi)]
    outer = [(front(0.5), z_lo), (front(0.42), (z_lo + z_hi) / 2), (front(0.3), z_hi)]
    surface_band(bm, inner, outer, off - 0.004, off + 0.012, material, across=8, per=2)


def camp_collar(bm, v, material, off=TOP_OFF):
    """A camp shirt's open collar: a flat collar lying back on each side of the V, its points
    reaching down onto the chest, carried round the back of the neck."""
    zs = (v.z_n, v.z_n - 0.035, v.z_n - 0.07, v.z_n - 0.105, v.z_v + 0.01)
    ws = (0.14, 0.18, 0.21, 0.23, 0.2)
    for s in (-1, 1):
        inner = [(front(s * max(0.0, v.edge(z) - 0.01)), z) for z in zs]
        outer = [(front(s * (max(0.0, v.edge(z) - 0.01) + w)), z - (0.03 if k == len(zs) - 1 else 0.0)) for k, (z, w) in enumerate(zip(zs, ws))]
        surface_band(bm, inner, outer, off + 0.002, off + 0.013, material, across=4, per=2)
    d0 = v.half - 0.02
    back = [on_trunk(front(d0 + (2 * math.pi - 2 * d0) * k / 12), v.z_n + 0.004, off + 0.004) for k in range(13)]
    ribbon(bm, back, 0.028, 0.009, material)


def crossed_collar(bm, v, material, lining, off=TOP_OFF + 0.014, width=0.034, thick=0.009, low=(-0.42, 0.3)):
    """A robe's collar crossed left over right: a broad band from the back of the neck over each
    shoulder, her left panel's edge running down across her to her right hip, her right one's
    showing only above where it passes under; a white under-collar peeking out along both edges."""
    over = [on_trunk(front(v.edge(z) + 0.05), z, off) for z in (v.z_n - 0.005, v.z_n - 0.04, v.z_n - 0.08, v.z_v + 0.03)]
    over += [on_trunk(front(d), z, off) for d, z in ((-0.1, v.z_v - 0.05), (-0.25, (v.z_v + low[1]) / 2 - 0.02), low)]
    back = [on_trunk(front(v.half + 0.12 + (2 * math.pi - 2 * v.half - 0.24) * k / 10), v.z_n + 0.006, off) for k in range(11)]
    under = [on_trunk(front(-(v.edge(z) + 0.05)), z, off - 0.004) for z in (v.z_n - 0.005, v.z_n - 0.04, v.z_n - 0.08, v.z_v + 0.02)]
    path = list(reversed(over)) + back + under
    if lining is not None:
        ribbon(bm, [p - body_normal(p) * 0.004 for p in path], width + 0.014, thick * 0.7, lining)
    ribbon(bm, path, width, thick, material)


def obi(bm, material, z=0.31, half_z=0.045, off=TOP_OFF + 0.03, bow="back", cord=None):
    """A thick sash round the waist (an obi) and its knotted bow, fused: two broad loops and two
    tails behind (bow="back"), or a knot and two hanging ends at the side (bow="side"); `cord` a
    thin cord tied round its middle."""
    if half_z > 0:
        waist_band(bm, z, off, 0.014, half_z, material=material)
    if cord is not None:
        waist_band(bm, z, off + 0.012, 0.004, 0.004, material=cord)
    if bow == "back":
        c = on_trunk(math.pi / 2, z, off + 0.02)

        def knot(b):
            add_shaped(b, 8, blob(c + Vector((0, 0.012, 0)), AXES, Vector((0.024, 0.022, 0.032))))
            for s in (-1, 1):
                add_shaped(b, 10, blob(c + Vector((s * 0.058, 0.008, 0.014)), AXES, Vector((0.05, 0.02, 0.034)), n=2.4))
                add_shaped(b, 8, blob(c + Vector((s * 0.026, 0.014, -0.052)), AXES, Vector((0.022, 0.012, 0.046)), n=2.4))

        fused(knot, material, fuse=BOW_FUSE)
    else:
        c = on_trunk(front(0.55), z, off + 0.014)
        add_shaped(bm, 6, blob(c, AXES, Vector((0.022, 0.018, 0.02))), material=material)
        for dx in (-0.012, 0.014):
            ribbon(bm, [c + Vector((dx, -0.004, -0.012)), c + Vector((dx * 1.6, -0.01, -0.06)), c + Vector((dx * 1.9, -0.012, -0.1))], 0.018, 0.005, material)
    return c


def overalls_straps(bm, material, buckle, button, off=OVERALLS_OFF, cross=True, width=0.032, thick=0.008):
    """Overalls' thick flat straps: from the bib's corners over the shoulders, crossing in an X down
    the back to the waist, each fastened to the bib by a molded metal clip on a brass button."""
    for s in (-1, 1):
        o = off + (0.003 if s > 0 else 0.0)
        down = [on_trunk(front(s * 0.36), z, o) for z in (OVERALLS_BIB_Z - 0.01, 0.53, 0.58)]
        over = [Vector((s * 0.088, y, 0.0)) for y in (-0.05, 0.0, 0.05)]
        over = [Vector((p.x, p.y, trunk_point(v_at_neck(math.hypot(p.x, p.y / TRUNK_DEPTH) / TRUNK_R[0]), 0.0, 0.0).z + o)) for p in over]
        k = s if cross else -s
        back = [on_trunk(math.pi / 2 - s * 0.36, 0.57, o), on_trunk(math.pi / 2 - s * 0.16, 0.5, o), on_trunk(math.pi / 2 + k * 0.08, 0.43, o), on_trunk(math.pi / 2 + k * 0.28, 0.36, o), on_trunk(math.pi / 2 + k * 0.42, OVERALLS_WAIST_Z - 0.006, o)] if cross else [on_trunk(math.pi / 2 - s * 0.42, z, o) for z in (0.57, 0.48, 0.38, OVERALLS_WAIST_Z - 0.006)]
        ribbon(bm, down + over + back, width, thick, material)
        # the clip: a molded metal frame over a brass button, the strap's end looped through it
        p, n = trunk_surf(v_at_z(OVERALLS_BIB_Z - 0.018), front(s * 0.36), off + thick)
        add_shaped(bm, 4, flat_blob(p, n, UP, Vector((0.024, 0.006, 0.02)), n=4.0), material=buckle)
        add_shaped(bm, 3, flat_blob(p + n * 0.006 + UP * 0.004, n, UP, Vector((0.011, 0.004, 0.009)), n=3.0), material=buckle)
        q, m = trunk_surf(v_at_z(OVERALLS_BIB_Z - 0.036), front(s * 0.36), off + 0.004)
        add_shaped(bm, 3, flat_blob(q, m, UP, Vector((0.009, 0.005, 0.009))), material=button)


def pocket_box(bm, a0, a1, z0, z1, off, depth, material, rivet=None, flap=None):
    """A deep 3D pocket: a box standing `depth` proud across a0..a1, z0..z1, a rolled top edge, and
    rivets at its top corners."""
    surface_band(bm, [(a0, z0), (a0, z1)], [(a1, z0), (a1, z1)], off - 0.004, off + depth, material, across=6, per=3)
    ribbon(bm, [on_trunk(a0 + (a1 - a0) * k / 6, z1, off + depth - 0.004) for k in range(7)], 0.008, 0.006, material if flap is None else flap)
    if rivet is not None:
        for a in (a0, a1):
            p, n = trunk_surf(v_at_z(z1 - 0.004), a, off + depth)
            add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.0045, 0.003, 0.0045))), material=rivet)


def leg_plate(bm, side, hip_y, t, phi, r, half, material, n=3.0):
    """A flat piece laid on a trouser leg at angle phi round it, t down from the hip."""
    p = leg_point(side, hip_y, t, phi, r)
    add_shaped(bm, 4, flat_blob(p, Vector((math.cos(phi), math.sin(phi), 0)), UP, half, n=n), material=material)


def hammer_loop(bm, side, hip_y, r_out, material):
    """A carpenter's hammer loop: a strap looped off the outside of the thigh."""
    phi = outward(side) - side * 0.35
    pts = [leg_point(side, hip_y, t, phi, r_out(t) + dr) for t, dr in ((0.03, 0.0), (0.042, 0.016), (0.07, 0.022), (0.098, 0.016), (0.11, 0.0))]
    ribbon(bm, pts, 0.018, 0.006, material, normal=axis_normal(side * LEG_X))


def work_leg(bm, side, hip_y, leg_r, pant_r, material, cuff_size=(0.0095, 0.012), length=LONG_LEG):
    """A sturdy straight work-trouser leg with a fat rolled cuff."""
    r_out = lambda t: pant_r - 0.012 * smoothstep(0.0, length, t)
    pant_leg(bm, side, hip_y, leg_r, length, r_out, material, cuff=material, cuff_size=cuff_size)
    return r_out


def sleeve_check(bm, side, r_out, rings, length, material, count=4):
    """A buffalo check's dark bars round a sleeve and down it."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    for t in rings:
        band(bm, shoulder - UP * t, r_out(t) + 0.001, r_out(t) + 0.001, 0.003, 0.012, segs=28, sides=6, material=material)
    for k in range(count):
        phi = 2 * math.pi * (k + 0.5) / count
        strip(bm, [arm_point(side, t, phi, r_out(t) + 0.0015) for t in (0.03, 0.03 + (length - 0.03) / 2, length)], 0.01, material=material)


def plaid_bars(bm, zs, off, count, material, lo=0.24, hi=0.54):
    """A buffalo check's dark bars, round the body at heights zs and down it `count` times."""
    for z in zs:
        waist_band(bm, z, off, 0.004, 0.016, material=material)
    for k in range(count):
        a = front() + 2 * math.pi * (k + 0.5) / count
        strip(bm, [on_trunk(a, z, off + 0.001) for z in (lo, (lo * 2 + hi) / 3, (lo + hi * 2) / 3, hi)], 0.012, material=material)


def collar_points(bm, material, off=TOP_OFF, spread=0.3, z=0.585):
    """A shirt collar's two points lying on the chest either side of the throat."""
    for s in (-1, 1):
        deco(bm, v_at_z(z), front(s * spread), off + 0.012, Vector((0.034, 0.008, 0.03)), material=material, roll=s * 0.5)


# ---------------------------------------------------------------------------------------------
# streetwear: a hooded top, oversized sleeves gathered into ribbed cuffs, baggy joggers and chunky
# sneakers on white soles


HOODIE_OFF = TOP_OFF + 0.012


def top_hoodie(bm, part, side):
    # a heavyweight pullover hoodie: the hood down on the back, a pouch pocket, drawstrings with
    # tipped ends, a ribbed hem, oversized sleeves gathered into ribbed cuffs
    SH, TR, AC = range(3)
    if part:
        return bulky_sleeve(bm, side, LONG_SLEEVE, 0.018, SH, cuff=SH)
    top_body(bm, off=HOODIE_OFF)
    waist_band(bm, SEAM_Z + 0.014, HOODIE_OFF - 0.002, 0.012, 0.02)
    hood(SH)
    band(bm, Vector((0, -0.008, 0.587)), 0.126, 0.132, 0.006, 0.016, roundness=2.2, tilt=0.12, segs=48, sides=6, material=AC)  # the lining at the hood's mouth
    kangaroo_pocket(bm, HOODIE_OFF, SH)
    drawstrings(bm, HOODIE_OFF + 0.012, TR, AC)


def top_flannel(bm, part, side):
    # the Flannel Camp Vest: a buffalo-check flannel shirt with a pointed collar under a puffy
    # quilted vest in the accent colour, zipped, with a stand collar; roomy sleeves checked round
    SH, PL, AC, TR = range(4)
    if part:
        r_out = bulky_sleeve(bm, side, LONG_SLEEVE, 0.012, SH, cuff=SH)
        return sleeve_check(bm, side, r_out, (0.06, 0.12), 0.15, PL)
    top_body(bm)
    collar_points(bm, SH)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.015, 0.017)
    off = OUTER_OFF + 0.014
    trunk_shell(bm, v_at_z(0.225), v_at_neck(0.88), off, AC, segs=40, rows=12)
    for z in (0.265, 0.325, 0.385, 0.445, 0.5):
        waist_band(bm, z, off - 0.008, 0.013, 0.027, material=AC)  # the plump down baffles
    neck_band(bm, 0.88, off + 0.004, 0.02, 0.03, material=AC)  # the stand collar
    strip(bm, [on_trunk(front(), z, off + 0.014) for z in (0.57, 0.48, 0.38, 0.28, 0.23)], 0.005, material=TR)


def top_puffer(bm, part, side):
    # the Mustard Down Vest: a puffy quilted vest in mustard down over a hoodie, its hood fused on
    # up the back of the vest, a dark zip; the hoodie's oversized sleeves gathered into cuffs
    SH, PU, ZP = range(3)
    if part:
        return bulky_sleeve(bm, side, LONG_SLEEVE, 0.018, SH, cuff=SH)
    top_body(bm, off=HOODIE_OFF)
    waist_band(bm, SEAM_Z + 0.014, HOODIE_OFF - 0.002, 0.012, 0.02)
    off = OUTER_OFF + 0.018
    trunk_shell(bm, v_at_z(0.228), v_at_neck(0.9), off, PU, segs=40, rows=12)
    for z in (0.27, 0.335, 0.4, 0.465, 0.525):
        waist_band(bm, z, off - 0.008, 0.014, 0.029, material=PU)
    hood(PU, grow=0.03)
    strip(bm, [on_trunk(front(), z, off + 0.016) for z in (0.56, 0.47, 0.37, 0.27, 0.235)], 0.0055, material=ZP)


def top_sweater(bm, part, side):
    # an oversized cable-knit sweater: loose all over, a rolled crew neck, a ribbed hem, plaited
    # cables twisting down the front and the back, and bulky sleeves gathered into ribbed cuffs
    if part:
        return bulky_sleeve(bm, side, LONG_SLEEVE, 0.02, 0, cuff=0, cuff_len=0.036)
    top_body(bm, off=TOP_OFF + 0.012)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.026, 0.026, 0.028)
    waist_band(bm, SEAM_Z + 0.02, TOP_OFF + 0.008, 0.012, 0.022)
    zs = [SEAM_Z + 0.045 + 0.02 * i for i in range(16) if SEAM_Z + 0.045 + 0.02 * i < 0.55]
    for base in (front(), math.pi / 2):
        for k in (-1, 0, 1):
            a0 = base + k * 0.46
            for ph in (0.0, math.pi):
                tube(bm, [on_trunk(a0 + 0.045 * math.sin(z * 60 + ph), z, TOP_OFF + 0.015) for z in zs], lambda _: 0.0075, sides=6, cap_rings=2)


def top_lounge(bm, part, side):
    # Plaid Loungewear: a soft plaid zip hoodie, the hood down on the back lined in the accent
    # colour, plaid bars round and down it, a white zip, pouch pockets, sleeves gathered at the cuff
    SH, PL, AC, TR = range(4)
    if part:
        r_out = bulky_sleeve(bm, side, LONG_SLEEVE, 0.016, SH, cuff=AC)
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        for t in (0.06, 0.125):
            band(bm, shoulder - UP * t, r_out(t) + 0.001, r_out(t) + 0.001, 0.003, 0.01, segs=28, sides=6, material=PL)
        return
    top_body(bm, off=HOODIE_OFF)
    waist_band(bm, SEAM_Z + 0.014, HOODIE_OFF - 0.002, 0.012, 0.02, material=AC)
    plaid_bars(bm, (0.3, 0.41, 0.52), HOODIE_OFF + 0.001, 8, PL, lo=0.24, hi=0.55)
    hood(SH)
    band(bm, Vector((0, -0.008, 0.587)), 0.126, 0.132, 0.006, 0.016, roundness=2.2, tilt=0.12, segs=48, sides=6, material=AC)
    strip(bm, [on_trunk(front(), z, HOODIE_OFF + 0.004) for z in (0.56, 0.47, 0.37, 0.28, 0.225)], 0.006, material=TR)
    for s in (-1, 1):  # the pouch pockets either side of the zip
        surface_band(bm, [(front(s * 0.08), 0.25), (front(s * 0.08), 0.33)], [(front(s * 0.46), 0.25), (front(s * 0.36), 0.33)], HOODIE_OFF - 0.004, HOODIE_OFF + 0.01, SH, across=4, per=2)


def top_jumpsuit(bm, part, side):
    # the Retro Cyber Jumpsuit, all one piece from a sculpted tech hood down over the seat (the
    # legs carry on below): neon piping down the sides and across the chest, a neon zip, and
    # oversized sleeves gathered into neon cuffs
    SH, AC = range(2)
    if part:
        return bulky_sleeve(bm, side, LONG_SLEEVE, 0.016, SH, cuff=AC)
    trunk_shell(bm, 0.004, v_at_neck(NECK_FRAC), TOP_OFF + 0.006, SH, close_lo=True)
    hood(SH)
    band(bm, Vector((0, -0.008, 0.611)), 0.152, 0.158, 0.008, 0.006, roundness=2.0, tilt=0.12, segs=48, sides=6, material=AC)  # the hood's neon rim
    waist_band(bm, 0.46, TOP_OFF + 0.008, 0.005, 0.009, material=AC)
    waist_band(bm, SEAM_Z + 0.02, TOP_OFF + 0.008, 0.008, 0.016, material=AC)
    strip(bm, [on_trunk(front(), z, TOP_OFF + 0.008) for z in (0.56, 0.45, 0.33, 0.24)], 0.005, material=AC)
    for a in (0.0, math.pi):  # piping down each side
        strip(bm, [on_trunk(a, z, TOP_OFF + 0.008) for z in (0.5, 0.4, 0.3, 0.21)], 0.004, material=AC)


def bottom_joggers(bm, part, side, hip_y, leg_r, pant_r):
    # baggy joggers bunched over ribbed ankle cuffs, and canvas sneakers on thick white soles
    PA, SH, SO = range(3)
    if part:
        jogger_leg(bm, side, hip_y, leg_r, pant_r, PA)
        return sneakers(bm, side, hip_y, leg_r, SH, SO, SO)
    waist(bm)


def bottom_cargo(bm, part, side, hip_y, leg_r, pant_r):
    # cargo joggers: a flapped cargo pocket standing out on each thigh, ribbed cuffs, and trail
    # sneakers with a stripe of the accent colour round their white soles
    PA, SH, SO, AC = range(4)
    if part:
        r_out = jogger_leg(bm, side, hip_y, leg_r, pant_r, PA, bulk=0.014)
        phi = outward(side) - side * 0.3
        leg_plate(bm, side, hip_y, 0.075, phi, r_out(0.075) + 0.006, Vector((0.032, 0.012, 0.036)), PA)
        leg_plate(bm, side, hip_y, 0.042, phi, r_out(0.042) + 0.014, Vector((0.034, 0.006, 0.011)), PA)  # its flap
        return sneakers(bm, side, hip_y, leg_r, SH, SO, SO, stripe=AC)
    waist(bm)


def bottom_cyber(bm, part, side, hip_y, leg_r, pant_r):
    # the jumpsuit's legs, baggy and tapering, a neon band at the knee, into neon high-top sneakers
    PA, SH, SO, AC = range(4)
    if part:
        r_out = jogger_leg(bm, side, hip_y, leg_r, pant_r, PA, length=0.1, taper=0.008)
        band(bm, Vector((side * LEG_X, 0, hip_y - 0.045)), r_out(0.045) + 0.001, r_out(0.045) + 0.001, 0.004, 0.006, segs=28, sides=6, material=AC)
        return sneakers(bm, side, hip_y, leg_r, SH, SO, AC, high=True, stripe=AC)
    waist(bm)


def bottom_lounge(bm, part, side, hip_y, leg_r, pant_r):
    # plaid lounge joggers with plaid bars round them, cosy white socks and pool slides
    PA, PL, TR, SO, AC = range(5)
    if part:
        r_out = jogger_leg(bm, side, hip_y, leg_r, pant_r, PA, length=0.15, bulk=0.016)
        hip = Vector((side * LEG_X, 0, hip_y))
        for t in (0.05, 0.095):
            band(bm, hip - UP * t, r_out(t) + 0.002, r_out(t) + 0.002, 0.003, 0.008, segs=28, sides=6, material=PL)
        fused(lambda b: socks(b, side, hip_y, leg_r), TR)
        return slides(bm, side, SO, AC)
    waist(bm)


# ---------------------------------------------------------------------------------------------
# workwear: overalls' thick straps, molded metal clips, deep pockets and hammer loops, rolled
# cuffs, and lace-up work boots on lug soles


def bottom_overalls(bm, part, side, hip_y, leg_r, pant_r, pocket=True):
    # Classic Denim Overalls, worn over the tee as one garment: the seat, the waist and the bib a
    # single shell rising in front into the bib; thick straps crossing at the back and clipped on
    # with molded metal buckles; a deep box pocket on the bib, brass side buttons and rivets; a
    # hammer loop and a tool pocket on the legs, rolled cuffs, and tan work boots on lug soles
    PA, BU, BK, BO, LU = range(5)
    if part:
        r_out = work_leg(bm, side, hip_y, leg_r, pant_r, PA)
        if side > 0:
            hammer_loop(bm, side, hip_y, r_out, PA)
        else:
            leg_plate(bm, side, hip_y, 0.07, outward(side) + 0.3, r_out(0.07) + 0.004, Vector((0.03, 0.009, 0.034)), PA)
        return work_boots(bm, side, hip_y, leg_r, BO, LU, LU, BK)
    trunk_shell(bm, 0.004, overalls_top, overalls_off, PA, close_lo=True, segs=40, rows=12)
    overalls_straps(bm, PA, BK, BU)
    if pocket:
        pocket_box(bm, front(-0.2), front(0.2), 0.36, 0.44, OVERALLS_OFF, 0.018, PA, rivet=BU)
    for s in (-1, 1):  # the side buttons at the hips
        p, n = trunk_surf(v_at_z(0.255), front(s * 1.35), OVERALLS_OFF)
        add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.009, 0.005, 0.009))), material=BU)


def bottom_garden(bm, part, side, hip_y, leg_r, pant_r):
    # Denim Garden Overalls: the overalls with a deep patch pocket on the bib, a sunflower stitched
    # on it, a trowel's wooden handle out of a hip pocket, deep rolled cuffs, and green rubber
    # garden boots on lug soles
    PA, BU, BK, PC, WD, GB, LU = range(7)
    if part:
        r_out = work_leg(bm, side, hip_y, leg_r, pant_r, PA, cuff_size=(0.014, 0.017))
        if side > 0:
            hammer_loop(bm, side, hip_y, r_out, PA)
        return work_boots(bm, side, hip_y, leg_r, GB, LU, LU, BK, top_z=0.16)
    bottom_overalls(bm, "", side, hip_y, leg_r, pant_r, pocket=False)
    pocket_box(bm, front(-0.24), front(0.24), 0.35, 0.45, OVERALLS_OFF, 0.016, PA, rivet=BU)
    flower = on_trunk(front(), 0.4, OVERALLS_OFF + 0.018)
    for k in range(8):
        a = 2 * math.pi * k / 8
        add_shaped(bm, 3, blob(flower + Vector((math.cos(a) * 0.019, -0.002, math.sin(a) * 0.019)), AXES, Vector((0.011, 0.005, 0.011))), material=PC)
    add_shaped(bm, 4, blob(flower + Vector((0, -0.006, 0)), AXES, Vector((0.012, 0.006, 0.012))), material=WD)
    hip = on_trunk(front(-1.05), 0.29, OVERALLS_OFF + 0.012)
    strip(bm, [hip, hip + Vector((-0.012, 0.004, 0.065))], 0.009, material=WD)


def bottom_blueprint(bm, part, side, hip_y, leg_r, pant_r):
    # the Velvet Pioneer's Blueprint Overalls: washed denim with pale stitched seams, a brass
    # folding ruler and a carpenter's pencil standing up out of the deep bib pocket, a hammer loop,
    # and tan work boots on lug soles
    PA, BU, BK, TR, WD, BO, LU = range(7)
    if part:
        r_out = work_leg(bm, side, hip_y, leg_r, pant_r, PA, cuff_size=(0.0085, 0.011))
        strip(bm, [leg_point(side, hip_y, t, outward(side), r_out(t) + 0.001) for t in (0.03, 0.08, 0.13)], 0.0025, material=TR)
        if side < 0:
            hammer_loop(bm, side, hip_y, r_out, PA)
        return work_boots(bm, side, hip_y, leg_r, BO, LU, LU, BK)
    bottom_overalls(bm, "", side, hip_y, leg_r, pant_r)
    strip(bm, [on_trunk(front(a), 0.44, OVERALLS_OFF + 0.019) for a in (-0.18, 0.0, 0.18)], 0.003, material=TR)
    ruler = on_trunk(front(0.1), 0.43, OVERALLS_OFF + 0.012)
    add_shaped(bm, 3, blob(ruler + Vector((0, 0, 0.03)), AXES, Vector((0.01, 0.004, 0.05)), n=6.0), material=BU)
    for k in range(4):
        add_shaped(bm, 2, blob(ruler + Vector((0, -0.004, -0.008 + 0.018 * k)), AXES, Vector((0.011, 0.003, 0.002)), n=4.0), material=BU)
    pencil = on_trunk(front(-0.08), 0.43, OVERALLS_OFF + 0.012)
    strip(bm, [pencil, pencil + Vector((0.004, 0, 0.075))], 0.0055, material=WD)
    for s in (-1, 1):
        strip(bm, [on_trunk(front(s * 0.4), z, OVERALLS_OFF + 0.004) for z in (OVERALLS_BIB_Z - 0.01, 0.4, 0.33)], 0.0025, material=TR)


WADERS_TOP = (0.49, 0.44)  # chest waders' top edge: at the front, and round the back


def waders_top(a):
    f = 1 - smoothstep(0.3, 1.3, from_front(a))
    return v_at_z(WADERS_TOP[1]) + (v_at_z(WADERS_TOP[0]) - v_at_z(WADERS_TOP[1])) * f


def waders_off(z):
    return BOTTOM_OFF + (OVERALLS_OFF + 0.006 - BOTTOM_OFF) * smoothstep(SEAT_TOP, SEAM_Z - 0.02, z)


def bottom_waders(bm, part, side, hip_y, leg_r, pant_r):
    # River Wader Dungarees: rubber chest waders cut high all round the chest, on webbing straps
    # with side-release buckles, a wading belt, a chest tackle pouch with a lure clipped to it,
    # the legs running into chunky laced wading boots on lug soles, splashed with river mud
    PA, EL, ST, BO, LU, MU, RD = range(7)
    if part:
        L = 0.112
        r_out = lambda t: pant_r + 0.004 * smoothstep(0.0, 0.03, t) - 0.004 * smoothstep(0.03, L, t)
        pant_leg(bm, side, hip_y, leg_r, L, r_out, PA)
        work_boots(bm, side, hip_y, leg_r, BO, LU, EL, ST, top_z=0.175, lugs=18)
        for k in range(6):  # splashes of river mud
            a = 2 * math.pi * k / 6 + side
            r = max(leg_radius(leg_r)(hip_y - 0.07), ANKLE_R) + 0.018
            add_shaped(bm, 3, blob(Vector((side * LEG_X + math.cos(a) * r, math.sin(a) * r, 0.05 + 0.03 * (k % 2))), AXES, Vector((0.012, 0.012, 0.009))), material=MU)
        return
    trunk_shell(bm, 0.004, waders_top, waders_off, PA, close_lo=True, segs=40, rows=12)
    for s in (-1, 1):
        o = OVERALLS_OFF + 0.006
        down = [on_trunk(front(s * 0.4), z, o) for z in (WADERS_TOP[0] - 0.005, 0.54, 0.585)]
        over = [Vector((s * 0.09, y, 0.0)) for y in (-0.05, 0.0, 0.05)]
        over = [Vector((p.x, p.y, trunk_point(v_at_neck(math.hypot(p.x, p.y / TRUNK_DEPTH) / TRUNK_R[0]), 0.0, 0.0).z + o)) for p in over]
        back = [on_trunk(math.pi / 2 - s * 0.4, z, o) for z in (0.57, 0.51, WADERS_TOP[1] + 0.002)]
        ribbon(bm, down + over + back, 0.026, 0.006, EL)
        p, n = trunk_surf(v_at_z(0.525), front(s * 0.4), o + 0.006)
        add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.017, 0.007, 0.022)), n=3.5), material=ST)
    waist_band(bm, 0.285, waders_off(0.285) + 0.006, 0.007, 0.018, material=EL)  # the wading belt
    p, n = trunk_surf(v_at_z(0.285), front(), waders_off(0.285) + 0.014)
    add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.022, 0.006, 0.02)), n=3.5), material=ST)
    pocket_box(bm, front(-0.2), front(0.2), 0.37, 0.45, OVERALLS_OFF + 0.004, 0.02, EL)
    strip(bm, [on_trunk(front(a), 0.44, OVERALLS_OFF + 0.026) for a in (-0.16, 0.0, 0.16)], 0.0025, material=ST)  # its zip
    clip = on_trunk(front(0.3), 0.43, OVERALLS_OFF + 0.03)
    band(bm, clip, 0.011, 0.011, 0.003, 0.003, segs=16, sides=6, material=ST)
    add_shaped(bm, 4, blob(clip - UP * 0.022, AXES, Vector((0.008, 0.006, 0.014))), material=RD)


def bottom_workpants(bm, part, side, hip_y, leg_r, pant_r):
    # the lumberjack's canvas work trousers: the shirt tucked into a waistband with belt loops,
    # rolled cuffs, and tan work boots on lug soles
    PA, BO, LU, BK = range(4)
    if part:
        work_leg(bm, side, hip_y, leg_r, pant_r, PA, cuff_size=(0.011, 0.014))
        return work_boots(bm, side, hip_y, leg_r, BO, LU, LU, BK)
    waist(bm)
    waist_band(bm, 0.232, TOP_OFF + 0.008, 0.008, 0.02, material=PA)
    for k in range(6):
        a = front() + 2 * math.pi * (k + 0.5) / 6
        p, n = trunk_surf(v_at_z(0.232), a, TOP_OFF + 0.016)
        add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.006, 0.004, 0.022)), n=3.0), material=PA)


def top_tee(bm, part, side):
    # a crew-neck tee, its short sleeves turned up in a cuff (worn under overalls)
    if part:
        sleeve(bm, side, SHORT_SLEEVE, cuff=0)
        return
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.016, 0.018)


def top_thermal(bm, part, side):
    # a waffle-knit thermal henley under the waders: a buttoned placket at the throat, sleeves
    # pushed up the forearm in soft bunches
    SH, BU = range(2)
    if part:
        L = 0.15
        sleeve(bm, side, L, SH, loose=SLEEVE_LOOSE + 0.002)
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        for t in (L - 0.035, L - 0.012):
            r = arm_radius(t) + SLEEVE_LOOSE + 0.006
            band(bm, shoulder - UP * t, r, r, 0.006, 0.01, segs=28, sides=6, material=SH)
        return
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.014, 0.02)
    ribbon(bm, [on_trunk(front(), z, TOP_OFF) for z in (0.585, 0.53, 0.49)], 0.022, 0.004, SH)
    for z in (0.565, 0.535, 0.505):
        p, n = trunk_surf(v_at_z(z), front(), TOP_OFF + 0.004)
        add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.006, 0.003, 0.006))), material=BU)


def top_chambray(bm, part, side):
    # the Pioneer's chambray work shirt under the Blueprint Overalls: a pointed collar, a buttoned
    # placket, the sleeves rolled to the elbow
    SH, BU = range(2)
    if part:
        return rolled_sleeve(bm, side, material=SH)
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.014, 0.017)
    collar_points(bm, SH)
    for z in (0.56, 0.52):
        p, n = trunk_surf(v_at_z(z), front(), TOP_OFF + 0.004)
        add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.006, 0.003, 0.006))), material=BU)


def top_plaid(bm, part, side):
    # Lumberjack Suspenders: a red buffalo-check flannel with its sleeves rolled to the elbow, a
    # neckerchief knotted at the throat, and leather Y-back suspenders: two straps up the front and
    # over the shoulders, meeting in a leather patch between the shoulder blades and running down
    # the back as one, clipped to the trousers' waistband with steel clips
    SH, PL, LE, ST, AC = range(5)
    if part:
        rolled_sleeve(bm, side, material=SH, roll=SH)
        sleeve_check(bm, side, lambda t: arm_radius(t) + SLEEVE_LOOSE, (0.055,), 0.1, PL)
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        r = arm_radius(0.12) + SLEEVE_LOOSE + 0.006
        band(bm, shoulder - UP * 0.112, r + 0.009, r + 0.009, 0.004, 0.006, segs=28, sides=6, material=PL)  # a dark bar round the roll
        return
    top_body(bm)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.006, 0.015, 0.017, material=PL)
    plaid_bars(bm, (0.3, 0.41, 0.52), TOP_OFF + 0.001, 8, PL)
    # the neckerchief: a triangle over the chest under a knot at the throat
    surface_band(bm, [(front(-0.2), 0.575), (front(-0.012), 0.5)], [(front(0.2), 0.575), (front(0.012), 0.5)], TOP_OFF + 0.004, TOP_OFF + 0.012, AC, across=4, per=3)
    add_shaped(bm, 5, blob(on_trunk(front(), 0.575, TOP_OFF + 0.018), AXES, Vector((0.018, 0.014, 0.015))), material=AC)
    off = TOP_OFF + 0.012
    patch_at = (math.pi / 2, 0.46)
    for s in (-1, 1):
        a_front = front(s * 0.3)
        down = [on_trunk(a_front, z, off) for z in (0.25, 0.36, 0.48, 0.575)]
        over = [Vector((s * 0.09, y, 0.0)) for y in (-0.05, 0.0, 0.05)]
        over = [Vector((p.x, p.y, trunk_point(v_at_neck(math.hypot(p.x, p.y / TRUNK_DEPTH) / TRUNK_R[0]), 0.0, 0.0).z + off)) for p in over]
        back = [on_trunk(math.pi / 2 - s * 0.34, 0.575, off), on_trunk(math.pi / 2 - s * 0.14, 0.5, off), on_trunk(patch_at[0], patch_at[1] + 0.004, off)]
        ribbon(bm, down + over + back, 0.026, 0.006, LE)
        p, n = trunk_surf(v_at_z(0.255), a_front, off + 0.006)
        add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.019, 0.006, 0.022)), n=3.5), material=ST)
    ribbon(bm, [on_trunk(patch_at[0], z, off) for z in (patch_at[1], 0.37, 0.25)], 0.028, 0.006, LE)
    surface_band(bm, [(math.pi / 2 - 0.16, patch_at[1] + 0.03), (math.pi / 2 - 0.02, patch_at[1] - 0.04)], [(math.pi / 2 + 0.16, patch_at[1] + 0.03), (math.pi / 2 + 0.02, patch_at[1] - 0.04)], off - 0.002, off + 0.01, LE, across=4, per=3)
    p, n = trunk_surf(v_at_z(0.255), math.pi / 2, off + 0.006)
    add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.019, 0.006, 0.022)), n=3.5), material=ST)


# ---------------------------------------------------------------------------------------------
# summer: an open camp collar and a V at the throat, short sleeves cuffed at mid-bicep,
# knee-length shorts, bare shins, and deck shoes or sandals


CAMP_V = plunge(0.455, 0.44)


def camp_off(z):
    return TOP_OFF + 0.004 + 0.008 * (1 - smoothstep(0.2, 0.3, z))  # boxy and untucked


def top_hawaiian(bm, part, side):
    # the Hawaiian Floral Set's camp shirt: an open camp collar lying back from a V that shows the
    # collarbone, a buttoned placket below it, short roomy sleeves turned up at mid-bicep, and
    # white hibiscus printed all over it
    SH, TR, AC, BU = range(4)
    if part:
        L = 0.072
        sleeve(bm, side, L, SH, loose=0.024, flare=0.01)
        r = arm_radius(L) + 0.024 + 0.01 + 0.002
        band(bm, Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z)) - UP * (L - 0.008), r, r, 0.006, 0.011, segs=28, sides=6, material=SH)
        for phi in (0.6, 2.4, 4.2):
            p = arm_point(side, 0.04, phi, arm_radius(0.04) + 0.03)
            star(bm, p, Vector((math.cos(phi), math.sin(phi), 0)), UP, 0.016, thick=0.002, material=TR)
        return
    trunk_shell(bm, v_at_z(0.2), CAMP_V, camp_off, SH, segs=48, rows=12)
    camp_collar(bm, CAMP_V, SH)
    ribbon(bm, [on_trunk(front(), z, camp_off(z)) for z in (CAMP_V.z_v - 0.005, 0.36, 0.28, 0.205)], 0.02, 0.003, SH)
    for z in (0.42, 0.35, 0.28):
        p, n = trunk_surf(v_at_z(z), front(), camp_off(z) + 0.003)
        add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.008, 0.004, 0.008))), material=BU)
    for z, a in ((0.45, 0.9), (0.33, -0.7), (0.26, 1.6), (0.5, -2.2), (0.38, 2.6), (0.3, -2.4), (0.48, 1.9), (0.27, -1.1), (0.4, 0.2), (0.55, 2.9)):
        v = v_at_z(z)
        surf = lambda aa, vv: trunk_surf(vv, aa, camp_off(trunk_point(vv, aa).z))
        for k in range(5):
            ang = 2 * math.pi * k / 5
            patch(bm, surf, a + 0.07 * math.cos(ang), v + 0.02 * math.sin(ang), 0.065, 0.02, material=TR, rings=2, segs=10)
        patch(bm, surf, a, v, 0.035, 0.011, lift=0.003, material=AC, rings=2, segs=10)


def tank_top(a):
    """A tank top's top edge: broad straps from the neck out over the shoulders, a scoop at the
    front and the back, and armholes cut down the sides."""
    d = from_front(a)
    neck = v_at_neck(NECK_FRAC)
    front_scoop = 1 - smoothstep(0.12, 0.4, d)
    back_scoop = 1 - smoothstep(0.12, 0.4, math.pi - d)
    armhole = smoothstep(0.72, 1.02, d) * (1 - smoothstep(math.pi - 1.02, math.pi - 0.72, d))
    return neck + (v_at_z(0.53) - neck) * front_scoop + (v_at_z(0.55) - neck) * back_scoop + (v_at_z(0.47) - neck) * armhole


def top_swim(bm, part, side):
    # the Beach Swim Set's striped tank: bare arms, a scoop neck, deep armholes, white stripes
    SH, TR = range(2)
    if part:
        return
    trunk_shell(bm, v_at_z(0.205), tank_top, TOP_OFF + 0.002, SH, segs=56, rows=12)
    for z in (0.25, 0.3, 0.35, 0.4):
        waist_band(bm, z, TOP_OFF + 0.004, 0.003, 0.011, material=TR)


def bottom_khakis(bm, part, side, hip_y, leg_r, pant_r):
    # knee-length khaki shorts with turned-up cuffs, bare shins, and suede deck shoes on white
    # soles with rawhide laces
    PA, SU, SO, LA = range(4)
    if part:
        L = 0.12
        r_out = lambda t: pant_r + 0.016 * smoothstep(0.0, L, t)
        pant_leg(bm, side, hip_y, leg_r, L, r_out, PA)
        r = r_out(L) + 0.004
        band(bm, Vector((side * LEG_X, 0, hip_y - (L - 0.01))), r, r, 0.006, 0.013, segs=32, sides=8, material=PA)
        return boat_shoes(bm, side, SU, SO, LA)
    waist(bm)


def bottom_board(bm, part, side, hip_y, leg_r, pant_r):
    # board shorts to the knee, a stripe of the accent colour down each side, and flip-flops
    PA, AC, SO = range(3)
    if part:
        L = 0.13
        r_out = lambda t: pant_r + 0.02 * smoothstep(0.0, L, t)
        pant_leg(bm, side, hip_y, leg_r, L, r_out, PA)
        ribbon(bm, [leg_point(side, hip_y, t, outward(side), r_out(t)) for t in (0.0, 0.04, 0.08, L - 0.004)], 0.024, 0.003, AC, normal=axis_normal(side * LEG_X))
        return flip_flops(bm, side, SO, AC)
    waist(bm)


# ---------------------------------------------------------------------------------------------
# robe: a robe down over the thighs (its skirt carried on the legs), wide bell sleeves, a crossed
# or shawl collar, and a thick sash or obi knotted


YUKATA_V = plunge(0.44, 0.45)


def top_yukata(bm, part, side):
    # the Indigo Bath Yukata: cotton to the shins, wide bell sleeves, the collar crossed left over
    # right over a white under-collar, a pale print scattered over it, and an obi in the accent
    # colour tied in a big bow at the back
    SH, TR, AC = range(3)
    if part:
        bell_sleeve(bm, side, 0.17, 0.05, SH)
        for t, phi in ((0.06, 0.4), (0.11, 2.0), (0.14, 4.0), (0.08, 5.2)):
            p = arm_point(side, t, phi, arm_radius(t) + 0.02 + 0.05 * (t / 0.17) ** 2 + 0.001)
            star(bm, p, Vector((math.cos(phi), math.sin(phi), 0)), UP, 0.01, thick=0.002, material=TR)
        return bell_scale(bm, side, 0.17)
    trunk_shell(bm, v_at_z(0.19), YUKATA_V, robe_off, SH, segs=48, rows=12)
    crossed_collar(bm, YUKATA_V, SH, TR)
    obi(bm, AC)
    for d, z in ((0.9, 0.5), (1.5, 0.45), (2.2, 0.52), (2.9, 0.47), (3.6, 0.5), (4.3, 0.44), (5.0, 0.52), (5.5, 0.46), (1.2, 0.23), (2.6, 0.24), (3.9, 0.22), (5.2, 0.24)):
        p, n = trunk_surf(v_at_z(z), front(d), robe_off(z))
        star(bm, p, n, UP, 0.01, thick=0.002, material=TR)


def top_starry(bm, part, side):
    # the Starry Night Yukata: midnight silk embroidered with silver constellations, wide bell
    # sleeves strewn with stars, the collar crossed over a silver under-collar, and a gold obi
    # bound with a silver cord and tied in a bow at the back
    SH, ST, GO = range(3)
    if part:
        bell_sleeve(bm, side, 0.17, 0.055, SH, cuff=ST)
        r_at = lambda t: arm_radius(t) + 0.02 + 0.055 * (t / 0.17) ** 2 + 0.0015
        spots = ((0.05, 0.3), (0.09, 1.0), (0.13, 0.6), (0.07, 3.4), (0.12, 4.4), (0.15, 2.2))
        for t, phi in spots:
            star(bm, arm_point(side, t, phi, r_at(t)), Vector((math.cos(phi), math.sin(phi), 0)), UP, 0.012, material=ST)
        line = []
        for (t0, p0), (t1, p1) in zip(spots[:2], spots[1:3]):
            line += [arm_point(side, t0 + (t1 - t0) * k / 5, p0 + (p1 - p0) * k / 5, r_at(t0 + (t1 - t0) * k / 5)) for k in range(5)]
        line.append(arm_point(side, spots[2][0], spots[2][1], r_at(spots[2][0])))
        tube(bm, line, lambda _: 0.0014, sides=4, cap_rings=1, material=ST)
        return bell_scale(bm, side, 0.17)
    trunk_shell(bm, v_at_z(0.19), YUKATA_V, robe_off, SH, segs=48, rows=12)
    crossed_collar(bm, YUKATA_V, SH, ST)
    obi(bm, GO, cord=ST)
    constellations = (
        ((2.55, 0.52), (2.8, 0.49), (3.05, 0.48), (3.3, 0.46), (3.45, 0.42), (3.72, 0.41), (3.68, 0.375)),  # the Dipper, across the back
        ((0.85, 0.52), (1.05, 0.46), (0.8, 0.4), (1.1, 0.39)),
        ((-0.85, 0.53), (-1.15, 0.48), (-0.95, 0.41)),
        ((1.6, 0.25), (1.9, 0.22), (2.2, 0.245)),
        ((-1.7, 0.24), (-2.05, 0.215)),
    )
    for group in constellations:
        for d, z in group:
            trunk_star(bm, d, z, robe_off(z) + 0.001, 0.013, ST)
        path = []
        for (d0, z0), (d1, z1) in zip(group, group[1:]):
            path += [on_trunk(front(d0 + (d1 - d0) * k / 5), z0 + (z1 - z0) * k / 5, robe_off(z0 + (z1 - z0) * k / 5) + 0.0015) for k in range(5)]
        path.append(on_trunk(front(group[-1][0]), group[-1][1], robe_off(group[-1][1]) + 0.0015))
        tube(bm, path, lambda _: 0.0014, sides=4, cap_rings=1, material=ST)
    for d, z in ((1.9, 0.5), (-1.9, 0.47), (2.3, 0.4), (-2.5, 0.52), (-3.0, 0.3), (0.6, 0.22), (-0.6, 0.23), (4.6, 0.45)):
        trunk_star(bm, d, z, robe_off(z) + 0.001, 0.009, ST)


BOXING_V = plunge(0.31, 0.5)


def boxing_hem(a):
    """The boxing robe's lower edge: below the belt its front panels part in an inverted V, showing
    the trunks' gold waistband."""
    f = max(0.0, 1 - from_front(a) / 0.42)
    return v_at_z(0.19) + (v_at_z(0.262) - v_at_z(0.19)) * f


def top_robe(bm, part, side):
    # the Boxing Robe: a satin robe to mid-thigh, a broad shawl collar and wide bell sleeves edged
    # in contrast piping, a belt knotted at the front, its front parting below the belt, and a
    # gold star on the back
    SH, TR, GO = range(3)
    if part:
        bell_sleeve(bm, side, 0.175, 0.045, SH, cuff=TR)
        return bell_scale(bm, side, 0.175)
    trunk_shell(bm, boxing_hem, BOXING_V, robe_off, SH, segs=48, rows=12)
    lapels(bm, BOXING_V, SH, peak=False, width=0.16, roll=TOP_OFF + 0.03, low=TOP_OFF + 0.002, piping=TR)
    waist_band(bm, 0.3, TOP_OFF + 0.014, 0.011, 0.018, material=SH)  # the belt, piped
    for z in (0.283, 0.317):
        waist_band(bm, z, TOP_OFF + 0.02, 0.004, 0.003, material=TR)
    obi(bm, SH, z=0.3, half_z=0.0, off=TOP_OFF + 0.014, bow="side")
    p, n = trunk_surf(v_at_z(0.44), math.pi / 2, robe_off(0.44))
    star(bm, p, n, UP, 0.05, thick=0.004, material=GO)


VELVET_V = plunge(0.32, 0.55)


def top_velvet(bm, part, side):
    # Velvet Loungewear: a velvet dressing robe over silk pyjamas (the pyjama shirt's piped collar in
    # the V), a quilted satin shawl collar and turn-back cuffs in the accent colour, wide bell
    # sleeves, a satin sash knotted at the side, and a gold crest on the breast pocket
    SH, AC, TR, GO, PJ = range(5)
    if part:
        bell_sleeve(bm, side, 0.175, 0.04, SH)
        r = arm_radius(0.175) + 0.02 + 0.04 + 0.002
        band(bm, Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z)) - UP * 0.16, r, r, 0.007, 0.018, segs=40, sides=8, material=AC)
        return bell_scale(bm, side, 0.175)
    trunk_shell(bm, v_at_z(0.3), v_at_neck(NECK_FRAC), TOP_OFF, PJ, segs=40, rows=10)
    neck_band(bm, NECK_FRAC, TOP_OFF + 0.008, 0.012, 0.018, material=TR)
    trunk_shell(bm, v_at_z(0.19), VELVET_V, lambda z: robe_off(z) + 0.012, SH, segs=48, rows=12)
    lapels(bm, VELVET_V, AC, peak=False, width=0.2, roll=TOP_OFF + 0.04, low=TOP_OFF + 0.012, quilt=AC)
    obi(bm, AC, z=0.3, half_z=0.018, off=TOP_OFF + 0.028, bow="side")
    pocket = (front(0.62), 0.45)
    surface_band(bm, [(pocket[0] - 0.14, pocket[1] - 0.04), (pocket[0] - 0.14, pocket[1] + 0.03)], [(pocket[0] + 0.14, pocket[1] - 0.04), (pocket[0] + 0.14, pocket[1] + 0.03)], robe_off(0.45) + 0.008, robe_off(0.45) + 0.02, SH, across=4, per=2)
    p, n = trunk_surf(v_at_z(pocket[1] - 0.005), pocket[0], robe_off(0.45) + 0.021)
    star(bm, p, n, UP, 0.014, thick=0.003, material=GO)


def bottom_yukata(bm, part, side, hip_y, leg_r, pant_r):
    # the yukata's skirt to the shins, its overlapping front edge lined in white, and wooden geta
    # on bare feet
    SH, TR, WD, AC = range(4)
    if part:
        robe_skirt(bm, side, hip_y, leg_r, pant_r, 0.195, 0.048, SH, hem=SH, edge=TR)
        for t, phi in ((0.1, 0.4), (0.15, 2.4), (0.13, 4.2), (0.17, 5.4)):
            p = leg_point(side, hip_y, t, phi, pant_r + 0.048 * smoothstep(0.05, 0.195, t) ** 0.9 + 0.001)
            star(bm, p, Vector((math.cos(phi), math.sin(phi), 0)), UP, 0.01, thick=0.002, material=TR)
        return geta(bm, side, WD, AC)
    waist(bm, material=SH)


def bottom_starry(bm, part, side, hip_y, leg_r, pant_r):
    # the Starry Night Yukata's skirt to the shins, strewn with silver stars, its front edge
    # piped in silver, and lacquered geta with gold straps
    SH, ST, WD, GO = range(4)
    if part:
        robe_skirt(bm, side, hip_y, leg_r, pant_r, 0.195, 0.05, SH, hem=ST, edge=ST)
        for t, phi in ((0.09, 0.3 * side), (0.14, 2.3), (0.12, 3.9), (0.17, 5.0), (0.16, 1.2)):
            p = leg_point(side, hip_y, t, phi, pant_r + 0.05 * smoothstep(0.05, 0.195, t) ** 0.9 + 0.001)
            star(bm, p, Vector((math.cos(phi), math.sin(phi), 0)), UP, 0.012, material=ST)
        return geta(bm, side, WD, GO)
    waist(bm, material=SH)


def bottom_boxing(bm, part, side, hip_y, leg_r, pant_r):
    # the robe's skirt to mid-thigh edged in piping, satin trunks under it with a broad gold
    # waistband (showing where the robe parts below its belt), and tall laced boxing boots
    SH, TR, PA, GO, LE = range(5)
    if part:
        pant_leg(bm, side, hip_y, leg_r, 0.07, lambda t: pant_r - 0.003 + 0.004 * smoothstep(0.0, 0.07, t), PA)
        robe_skirt(bm, side, hip_y, leg_r, pant_r, 0.1, 0.026, SH, hem=TR)
        return boxing_boots(bm, side, hip_y, leg_r, TR, LE, GO, GO)
    waist(bm, material=PA)
    waist_band(bm, 0.236, BOTTOM_OFF + 0.01, 0.007, 0.017, material=GO)


def bottom_velvet(bm, part, side, hip_y, leg_r, pant_r):
    # the dressing robe's skirt to the knee over silk pyjama trousers piped at the hem, and velvet
    # Albert slippers with a gold crest
    SH, PA, TR, VE, GO = range(5)
    if part:
        r_pj = lambda t: pant_r - 0.004 + 0.012 * smoothstep(0.0, LONG_LEG, t)
        pant_leg(bm, side, hip_y, leg_r, LONG_LEG + 0.01, r_pj, PA)
        r = r_pj(LONG_LEG + 0.01) + 0.001
        band(bm, Vector((side * LEG_X, 0, hip_y - LONG_LEG + 0.002)), r, r, 0.004, 0.005, segs=32, sides=6, material=TR)
        robe_skirt(bm, side, hip_y, leg_r, pant_r, 0.125, 0.03, SH, hem=SH)
        return dress_shoes(bm, side, VE, VE, crest=GO, slipper=True)
    waist(bm, material=SH)


# ---------------------------------------------------------------------------------------------
# formal: a jacket over a shirt with 3D lapels, a bow tie or a tie, long straight trousers, dress
# shoes


TUX_V = plunge(0.335, 0.56)


def formal_cuffs(bm, side, length, shirt, link=None):
    """A white shirt cuff showing past the jacket's sleeve, a gold cufflink on it."""
    shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
    r = arm_radius(length + 0.008) + 0.011
    band(bm, shoulder - UP * (length + 0.006), r, r, 0.005, 0.011, segs=28, sides=6, material=shirt)
    if link is not None:
        add_shaped(bm, 3, ellipsoid(arm_point(side, length + 0.006, outward(side), r + 0.004), Vector((0.0055, 0.0055, 0.0055))), material=link)


def top_tuxedo(bm, part, side):
    # the Velvet Evening Tuxedo: a jacket over a pleated white dress shirt with onyx studs, peaked
    # lapels in black satin standing proud of it, a crimson bow tie, a satin-covered button, jetted
    # pockets, a pocket square in the accent colour, white cuffs and gold cufflinks
    SH, TR, SA, CR, AC, GO = range(6)
    if part:
        sleeve(bm, side, LONG_SLEEVE - 0.012, SH, loose=SLEEVE_LOOSE + 0.002)
        return formal_cuffs(bm, side, LONG_SLEEVE - 0.012, TR, GO)
    dress_shirt(bm, TR)
    for d in (-0.12, -0.06, 0.06, 0.12):  # the pleats
        ribbon(bm, [on_trunk(front(d), z, TOP_OFF) for z in (0.36, 0.46, 0.56)], 0.008, 0.003, TR)
    for z in (0.5, 0.45, 0.4):
        p, n = trunk_surf(v_at_z(z), front(), TOP_OFF + 0.002)
        add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.0055, 0.004, 0.0055))), material=SA)
    formal_jacket(bm, TUX_V, material=SH)
    lapels(bm, TUX_V, SA, peak=True, width=0.17)
    c = on_trunk(front(), 0.572, TOP_OFF + 0.03)

    def bow(b):
        add_shaped(b, 6, blob(c, AXES, Vector((0.012, 0.011, 0.013))))
        for s in (-1, 1):
            add_shaped(b, 6, blob(c + Vector((s * 0.018, 0.002, 0.0)), AXES, Vector((0.012, 0.009, 0.012))))
            add_shaped(b, 8, blob(c + Vector((s * 0.037, 0.004, 0.0)), AXES, Vector((0.016, 0.009, 0.02)), n=2.4))

    fused(bow, CR, fuse=(0.0035, 2, 0.4))
    p, n = trunk_surf(v_at_z(0.322), front(), jacket_off(0.322))
    add_shaped(bm, 3, flat_blob(p, n, UP, Vector((0.011, 0.005, 0.011))), material=SA)
    for s in (-1, 1):  # jetted hip pockets
        ribbon(bm, [on_trunk(front(s * a), 0.262, jacket_off(0.262)) for a in (0.62, 0.78, 0.94)], 0.008, 0.004, SA)
    ribbon(bm, [on_trunk(front(a), 0.455, jacket_off(0.455)) for a in (0.44, 0.58, 0.72)], 0.008, 0.004, SA)  # the breast pocket
    add_shaped(bm, 4, blob(on_trunk(front(0.58), 0.47, jacket_off(0.47) + 0.006), AXES, Vector((0.02, 0.008, 0.013)), n=2.4), material=AC)


SMOKING_V = plunge(0.3, 0.58)


def top_smoking(bm, part, side):
    # the Vintage Smoking Jacket: velvet, a quilted black satin shawl collar standing proud of a
    # white shirt and a cravat in the accent colour, a black satin sash knotted at the hip with gold
    # tassels on its ends, quilted satin turn-back cuffs, and a pocket square
    SH, SA, TR, AC, GO = range(5)
    if part:
        L = LONG_SLEEVE - 0.01
        sleeve(bm, side, L, SH, loose=SLEEVE_LOOSE + 0.004)
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        r = arm_radius(L - 0.02) + SLEEVE_LOOSE + 0.008
        band(bm, shoulder - UP * (L - 0.018), r, r, 0.006, 0.022, segs=28, sides=8, material=SA)
        for k in range(8):  # the cuffs' quilting
            phi = 2 * math.pi * k / 8
            p = arm_point(side, L - 0.018, phi, r + 0.006)
            add_shaped(bm, 2, flat_blob(p, Vector((math.cos(phi), math.sin(phi), 0)), UP, Vector((0.007, 0.003, 0.007)), n=1.3), material=SA)
        return formal_cuffs(bm, side, L, TR)
    dress_shirt(bm, TR)
    add_shaped(bm, 6, blob(on_trunk(front(), 0.55, TOP_OFF + 0.012), AXES, Vector((0.024, 0.014, 0.034))), material=AC)  # the cravat
    formal_jacket(bm, SMOKING_V, hem_z=0.19, material=SH)
    lapels(bm, SMOKING_V, SA, peak=False, width=0.2, quilt=SA)
    waist_band(bm, 0.3, OUTER_OFF + 0.006, 0.012, 0.018, material=SA)  # the sash
    knot = on_trunk(front(0.55), 0.3, OUTER_OFF + 0.024)
    add_shaped(bm, 6, blob(knot, AXES, Vector((0.022, 0.018, 0.02))), material=SA)
    for dx in (-0.012, 0.014):
        end = knot + Vector((dx * 1.6, -0.006, -0.085))
        ribbon(bm, [knot + Vector((dx, -0.002, -0.01)), end], 0.016, 0.005, SA)
        add_shaped(bm, 4, blob(end + Vector((0, -0.004, -0.014)), AXES, Vector((0.011, 0.011, 0.018))), material=GO)  # a gold tassel
    add_shaped(bm, 4, blob(on_trunk(front(0.62), 0.47, jacket_off(0.47) + 0.006), AXES, Vector((0.02, 0.008, 0.013)), n=2.4), material=AC)


PIN_V = plunge(0.36, 0.52)


def top_pinstripe(bm, part, side):
    # the High Roller Pinstripe: a double-breasted pinstripe jacket with peaked lapels, six gold
    # buttons, flap pockets, a gold pocket-watch chain draped from a button to the watch in her hip
    # pocket, over a white shirt with a spread collar and a tie in the accent colour
    SH, PI, TR, AC, GO = range(5)
    if part:
        L = LONG_SLEEVE - 0.012
        sleeve(bm, side, L, SH, loose=SLEEVE_LOOSE + 0.002)
        sleeve_stripes(bm, side, L, lambda t: arm_radius(t) + SLEEVE_LOOSE + 0.002, 7, PI)
        for k in range(3):  # the cuff's buttons
            add_shaped(bm, 2, ellipsoid(arm_point(side, L - 0.03 + 0.011 * k, outward(side) - side * 0.5, arm_radius(L - 0.03 + 0.011 * k) + SLEEVE_LOOSE + 0.004), Vector((0.004, 0.004, 0.004))), material=GO)
        return formal_cuffs(bm, side, L, TR)
    dress_shirt(bm, TR)
    for s in (-1, 1):  # the spread collar's points
        surface_band(bm, [(front(s * 0.05), 0.58), (front(s * 0.1), 0.603)], [(front(s * 0.26), 0.55), (front(s * 0.3), 0.598)], TOP_OFF + 0.004, TOP_OFF + 0.012, TR, across=3, per=2)
    add_shaped(bm, 5, blob(on_trunk(front(), 0.572, TOP_OFF + 0.018), AXES, Vector((0.013, 0.011, 0.014))), material=AC)  # the tie's knot
    ribbon(bm, [on_trunk(front(), z, TOP_OFF + 0.006) for z in (0.56, 0.5, 0.44, 0.39, 0.375)], lambda s: 0.022 + 0.014 * s if s < 0.85 else 0.034 * (1 - s) / 0.15 + 0.002, 0.005, AC)
    formal_jacket(bm, PIN_V, hem_z=0.195, material=SH)
    for k in range(30):  # the pinstripes
        a = front() + 2 * math.pi * (k + 0.5) / 30
        d = from_front(a)
        z_top = 0.585 if d >= PIN_V.half else PIN_V.z_v + (PIN_V.z_n - PIN_V.z_v) * d / PIN_V.half - 0.012
        if z_top < 0.24:
            continue
        tube(bm, [on_trunk(a, z, jacket_off(z) + 0.0012) for z in (0.2 + (z_top - 0.2) * i / 8 for i in range(9))], lambda _: 0.0017, sides=5, cap_rings=1, material=PI)
    lapels(bm, PIN_V, SH, peak=True, width=0.19)
    for s in (-1, 1):
        for z in (0.34, 0.29, 0.245):
            p, n = trunk_surf(v_at_z(z), front(s * 0.2), jacket_off(z))
            add_shaped(bm, 2, flat_blob(p, n, UP, Vector((0.009, 0.005, 0.009))), material=GO)
        surface_band(bm, [(front(s * 0.6), 0.25), (front(s * 0.6), 0.275)], [(front(s * 0.95), 0.25), (front(s * 0.95), 0.275)], jacket_off(0.26) - 0.002, jacket_off(0.26) + 0.007, SH, across=4, per=2)
    a0, a1 = front(-0.2), front(-0.78)
    pts = [on_trunk(a0 + (a1 - a0) * k / 14, 0.245 + 0.035 * k / 14 - 0.034 * math.sin(math.pi * k / 14), jacket_off(0.25) + 0.005) for k in range(15)]
    for p, q in zip(pts, pts[1:]):  # the chain's links
        add_shaped(bm, 1, blob((p + q) / 2, aim_frame(q - p), Vector((0.0042, 0.0026, (q - p).length * 0.62))), material=GO)
    p, n = trunk_surf(v_at_z(0.283), a1, jacket_off(0.28) + 0.004)
    add_shaped(bm, 4, flat_blob(p, n, UP, Vector((0.013, 0.004, 0.013))), material=GO)  # the watch's gold case, peeking out
    add_shaped(bm, 4, blob(on_trunk(front(0.58), 0.47, jacket_off(0.47) + 0.006), AXES, Vector((0.02, 0.008, 0.012)), n=2.4), material=TR)


def bottom_tuxedo(bm, part, side, hip_y, leg_r, pant_r):
    # tuxedo trousers, straight to the shoe, a black satin stripe down each outer seam, and patent
    # oxfords
    PA, SA, LE = range(3)
    if part:
        r_out = dress_trouser_leg(bm, side, hip_y, leg_r, pant_r, PA, crease=False)
        ribbon(bm, [leg_point(side, hip_y, t, outward(side), r_out(t)) for t in (0.0, 0.06, 0.12, 0.19)], 0.012, 0.003, SA, normal=axis_normal(side * LEG_X))
        return dress_shoes(bm, side, LE, LE)
    waist(bm)


def bottom_smoking(bm, part, side, hip_y, leg_r, pant_r):
    # pressed evening trousers and burgundy velvet Albert slippers with a gold crest
    PA, VE, GO, LE = range(4)
    if part:
        dress_trouser_leg(bm, side, hip_y, leg_r, pant_r, PA)
        return dress_shoes(bm, side, VE, LE, crest=GO, slipper=True)
    waist(bm)


def bottom_pinstripe(bm, part, side, hip_y, leg_r, pant_r):
    # pinstriped trousers, pressed, and two-tone spectator oxfords: white with black wing-tip caps
    PA, PI, TR, LE = range(4)
    if part:
        r_out = dress_trouser_leg(bm, side, hip_y, leg_r, pant_r, PA)
        for k in range(8):
            phi = 2 * math.pi * (k + 0.5) / 8
            tube(bm, [leg_point(side, hip_y, t, phi, r_out(t) + 0.0012) for t in (0.012 + 0.182 * i / 7 for i in range(8))], lambda _: 0.0016, sides=5, cap_rings=1, material=PI)
        return dress_shoes(bm, side, TR, LE, cap=LE)
    waist(bm)


# each top and bottom: its materials, in material-index order, and its builder
TOPS = {
    "hoodie": (("Mat_Shirt", "Mat_Trim", "Mat_Accent"), top_hoodie),
    "tee": (("Mat_Shirt",), top_tee),
    "thermal": (("Mat_Shirt", "Mat_Button"), top_thermal),
    "chambray": (("Mat_Shirt", "Mat_Button"), top_chambray),
    "plaid": (("Mat_Shirt", "Mat_Plaid", "Mat_Saddle", "Mat_Steel", "Mat_Accent"), top_plaid),
    "flannel": (("Mat_Shirt", "Mat_Plaid", "Mat_Accent", "Mat_Trim"), top_flannel),
    "puffer": (("Mat_Shirt", "Mat_Puffer", "Mat_Plaid"), top_puffer),
    "sweater": (("Mat_Shirt",), top_sweater),
    "lounge": (("Mat_Shirt", "Mat_Plaid", "Mat_Accent", "Mat_Trim"), top_lounge),
    "jumpsuit": (("Mat_Shirt", "Mat_Accent"), top_jumpsuit),
    "hawaiian": (("Mat_Shirt", "Mat_Trim", "Mat_Accent", "Mat_Button"), top_hawaiian),
    "swim": (("Mat_Shirt", "Mat_Trim"), top_swim),
    "robe": (("Mat_Shirt", "Mat_Trim", "Mat_Gold"), top_robe),
    "yukata": (("Mat_Shirt", "Mat_Trim", "Mat_Accent"), top_yukata),
    "starry": (("Mat_Shirt", "Mat_Star", "Mat_Gold"), top_starry),
    "velvet": (("Mat_Shirt", "Mat_Accent", "Mat_Trim", "Mat_Gold", "Mat_Pants"), top_velvet),
    "tuxedo": (("Mat_Shirt", "Mat_Trim", "Mat_Satin", "Mat_Crimson", "Mat_Accent", "Mat_Gold"), top_tuxedo),
    "smoking": (("Mat_Shirt", "Mat_Satin", "Mat_Trim", "Mat_Accent", "Mat_Gold"), top_smoking),
    "pinstripe": (("Mat_Shirt", "Mat_Pin", "Mat_Trim", "Mat_Accent", "Mat_Gold"), top_pinstripe),
}
BOTTOMS = {
    "joggers": (("Mat_Pants", "Mat_Shoes", "Mat_Sole"), bottom_joggers),
    "cargo": (("Mat_Pants", "Mat_Shoes", "Mat_Sole", "Mat_Accent"), bottom_cargo),
    "cyber": (("Mat_Pants", "Mat_Shoes", "Mat_Sole", "Mat_Accent"), bottom_cyber),
    "lounge": (("Mat_Pants", "Mat_Plaid", "Mat_Trim", "Mat_Sole", "Mat_Accent"), bottom_lounge),
    "overalls": (("Mat_Pants", "Mat_Button", "Mat_Buckle", "Mat_WorkBoot", "Mat_Lug"), bottom_overalls),
    "garden": (("Mat_Pants", "Mat_Button", "Mat_Buckle", "Mat_PetalCentre", "Mat_Cinnamon", "Mat_Garden", "Mat_Lug"), bottom_garden),
    "blueprint": (("Mat_Pants", "Mat_Button", "Mat_Buckle", "Mat_Trim", "Mat_Stick", "Mat_WorkBoot", "Mat_Lug"), bottom_blueprint),
    "waders": (("Mat_Pants", "Mat_Elastic", "Mat_Steel", "Mat_Boot", "Mat_Lug", "Mat_Mud", "Mat_BobberRed"), bottom_waders),
    "workpants": (("Mat_Pants", "Mat_WorkBoot", "Mat_Lug", "Mat_Buckle"), bottom_workpants),
    "khakis": (("Mat_Pants", "Mat_Suede", "Mat_Sole", "Mat_Cinnamon"), bottom_khakis),
    "board": (("Mat_Pants", "Mat_Accent", "Mat_Sole"), bottom_board),
    "boxing": (("Mat_Shirt", "Mat_Trim", "Mat_Pants", "Mat_Gold", "Mat_Leather"), bottom_boxing),
    "yukata": (("Mat_Shirt", "Mat_Trim", "Mat_Wood", "Mat_Accent"), bottom_yukata),
    "starry": (("Mat_Shirt", "Mat_Star", "Mat_Wood", "Mat_Gold"), bottom_starry),
    "velvet": (("Mat_Shirt", "Mat_Pants", "Mat_Trim", "Mat_Velvet", "Mat_Gold"), bottom_velvet),
    "tuxedo": (("Mat_Pants", "Mat_Satin", "Mat_Leather"), bottom_tuxedo),
    "smoking": (("Mat_Pants", "Mat_Velvet", "Mat_Gold", "Mat_Leather"), bottom_smoking),
    "pinstripe": (("Mat_Pants", "Mat_Pin", "Mat_Trim", "Mat_Leather"), bottom_pinstripe),
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


def hat_cozybeanie(bm):
    # a chunky orange knit beanie: a tall dome with ribbed rows, a deep folded cuff, a big pom-pom
    slope = 0.18

    def shape(d):
        q = superellipsoid(d, 2.2)
        w = Vector((0, 0.015, 0.915)) + Vector((q.x * 0.305, q.y * 0.315, q.z * 0.29))
        cut = 0.95 - slope * w.y
        w.z = cut + soft_floor(w.z - cut, 0.01)
        return w

    add_shaped(bm, 18, shape)
    band(bm, Vector((0, 0.015, 0.99)), 0.296, 0.306, 0.016, 0.045, roundness=3.0, tilt=-math.atan(slope), material=1)
    # the cuff's knit ribs: little upright ridges all the way round its fold
    for k in range(40):
        a = 2 * math.pi * k / 40
        at = Vector((0.312 * math.cos(a), 0.015 + 0.322 * math.sin(a), 0.99 - slope * 0.322 * math.sin(a)))
        add_shaped(bm, 3, blob(at, AXES, Vector((0.007, 0.007, 0.036))), material=1)
    for z, k in ((1.075, 0.86), (1.13, 0.71)):  # the dome's own radius there, less a hair: ribs, not rings
        band(bm, Vector((0, 0.015, z)), 0.305 * k, 0.315 * k, 0.005, 0.009, roundness=3.0, tilt=-math.atan(slope), material=1)
    # a fluffy pompom: a cluster of soft tufts round a core
    pom = Vector((0, 0.03, 1.225))
    add_shaped(bm, 8, blob(pom, AXES, Vector((0.062,) * 3)), material=2)
    for k in range(10):
        a, b = 2.399 * k, math.acos(1 - 2 * (k + 0.5) / 10)
        d = Vector((math.sin(b) * math.cos(a), math.sin(b) * math.sin(a), math.cos(b)))
        add_shaped(bm, 4, blob(pom + d * 0.05, AXES, Vector((0.03,) * 3)), material=2)


def hat_boonie(bm):
    # a soft khaki boonie: a low crown, a floppy brim drooping all round, a band with a fishing
    # lure pinned to its side
    def crown(d):
        q = superellipsoid(d, 2.2)
        w = Vector((0, 0.015, 0.975)) + Vector((q.x * 0.29, q.y * 0.3, q.z * 0.15))
        w.z = 0.975 + soft_floor(w.z - 0.975, 0.008)
        return w

    add_shaped(bm, 16, crown)
    disc(bm, Vector((0, 0.015, 0.975)), 0.2, 0.39, 0.014, lambda r, a: -0.075 * max(0.0, (r - 0.27) / 0.12) ** 1.6)
    band(bm, Vector((0, 0.015, 0.995)), 0.293, 0.303, 0.012, 0.022, material=1)
    lure = Vector((0.27, -0.12, 1.0))
    add_shaped(bm, 6, blob(lure, AXES, Vector((0.026, 0.012, 0.016))), material=2)
    add_shaped(bm, 6, blob(lure + Vector((0.02, -0.012, 0.0)), AXES, Vector((0.014, 0.01, 0.012))), material=3)
    tube(bm, [lure + Vector((0.032, -0.02, 0.0)), lure + Vector((0.04, -0.03, -0.018)), lure + Vector((0.032, -0.036, -0.03))], lambda s: 0.003, sides=6, cap_rings=2, material=1)
    tilt_about(bm, Vector((0, 0.0, 0.975)), rx=-0.12)


def hat_bearcap(bm):
    # a soft fleece cap snug over the crown, two round bear ears with pale insides on top
    slope = 0.14

    def shape(d):
        q = superellipsoid(d, 2.4)
        w = Vector((0, 0.015, 0.93)) + Vector((q.x * 0.3, q.y * 0.31, q.z * 0.24))
        cut = 0.96 - slope * w.y
        w.z = cut + soft_floor(w.z - cut, 0.01)
        return w

    add_shaped(bm, 18, shape)
    band(bm, Vector((0, 0.015, 0.975)), 0.294, 0.304, 0.012, 0.018, roundness=3.0, tilt=-math.atan(slope), material=0)
    # (the ears are built apart, bear_ear, as child nodes: they bob as you walk)


BEAR_EAR_BASE = 1.09  # where each ear meets the cap: its pivot


def bear_ear(bm, side):
    """A rounded bear ear, extruded up off the cap, a pale inside facing forward."""
    centre = Vector((side * 0.2, 0.02, 1.14))
    add_shaped(bm, 10, blob(centre, AXES, Vector((0.072, 0.038, 0.07))))
    add_shaped(bm, 6, blob(Vector((side * 0.2, 0.02, BEAR_EAR_BASE + 0.005)), AXES, Vector((0.05, 0.03, 0.03))))  # its root in the cap
    add_shaped(bm, 8, blob(centre + Vector((0, -0.027, -0.005)), AXES, Vector((0.044, 0.012, 0.042))), material=1)


def hat_headlamp(bm):
    # a trail headlamp: an elastic band round the head and one over the crown, and on the brow a
    # little lamp whose lens glows warm
    band(bm, Vector((0, 0.015, 0.965)), 0.302, 0.312, 0.012, 0.022, roundness=3.0, tilt=-0.12)
    headband(bm, 0.02, 0.29, 0.31, 0.011, 0, reach=1.35)
    lamp = Vector((0, -0.322, 0.955))
    add_shaped(bm, 10, blob(lamp, AXES, Vector((0.055, 0.032, 0.04)), n=3.0), material=1)
    add_shaped(bm, 8, blob(lamp + Vector((0, -0.03, 0.0)), AXES, Vector((0.034, 0.01, 0.028))), material=2)


def paint(bm, material):
    """Every face in `bm` in one material slot."""
    for f in bm.faces:
        f.material_index = material


def knit_dome(bm, height=0.27, slope=0.18):
    """A knit beanie's dome over the hair, down to the brow in front and lower at the back."""

    def shape(d):
        q = superellipsoid(d, 2.2)
        w = Vector((0, 0.015, 0.915)) + Vector((q.x * 0.3, q.y * 0.31, q.z * height))
        cut = 0.95 - slope * w.y
        w.z = cut + soft_floor(w.z - cut, 0.01)
        return w

    add_shaped(bm, 18, shape)


def hat_frogbeanie(bm):
    # a frog beanie: a green knit dome and folded cuff, two big round eyes on top (a green lid, a
    # white eye, a dark pupil), and a little smile stitched on the cuff
    slope = 0.18
    knit_dome(bm, 0.27, slope)
    band(bm, Vector((0, 0.015, 0.985)), 0.294, 0.304, 0.014, 0.034, roundness=3.0, tilt=-math.atan(slope), material=1)
    for side in (-1, 1):
        eye = Vector((side * 0.12, -0.03, 1.15))
        add_shaped(bm, 10, blob(eye, AXES, Vector((0.075, 0.07, 0.068))))
        add_shaped(bm, 8, blob(eye + Vector((0, -0.045, 0.008)), AXES, Vector((0.052, 0.032, 0.05))), material=2)
        add_shaped(bm, 6, blob(eye + Vector((0, -0.072, 0.01)), AXES, Vector((0.026, 0.012, 0.03))), material=3)
    smile = [Vector((0.075 * x, -0.33, 1.032 - 0.016 * (1 - x * x))) for x in (-1.0, -0.5, 0.0, 0.5, 1.0)]
    tube(bm, smile, lambda s: 0.005, sides=6, cap_rings=2, material=4)


def hat_catbeanie(bm):
    # a cat beanie: a charcoal knit dome and cuff with two pointed cat ears, pink inside
    slope = 0.18
    knit_dome(bm, 0.26, slope)
    band(bm, Vector((0, 0.015, 0.985)), 0.294, 0.304, 0.014, 0.034, roundness=3.0, tilt=-math.atan(slope), material=1)
    for side in (-1, 1):
        base = Vector((side * 0.17, 0.02, 1.09))
        across, through, along = aim_frame(Vector((side * 0.45, 0.05, 1.0)))
        centre = base + along * 0.065
        add_shaped(bm, 10, blob(centre, (across, through, along), Vector((0.078, 0.036, 0.095)), n=1.5))
        front = through if through.y < 0 else -through
        add_shaped(bm, 8, blob(centre + front * 0.027 - along * 0.008, (across, through, along), Vector((0.044, 0.012, 0.06)), n=1.5), material=2)


def hat_painterberet(bm):
    # a painter's beret: big, soft and slumped well over to one side on its band, a stalk on top,
    # and dabs of red, yellow and mint paint on it
    band(bm, Vector((0, 0.01, 1.03)), 0.182, 0.19, 0.016, 0.018, material=1)
    top = bmesh.new()
    add_shaped(top, 14, blob(Vector((0.06, 0.02, 1.09)), AXES, Vector((0.29, 0.3, 0.075)), n=2.2))
    tube(top, line(Vector((0.06, 0.02, 1.15)), Vector((0.06, 0.02, 1.2)), 4), lambda s: 0.013, sides=10, cap_rings=3)
    for a, r, m in ((0.4, 0.18, 2), (2.1, 0.2, 3), (3.9, 0.15, 4), (5.2, 0.22, 2)):
        rim = math.sqrt(max(0.0, 1 - (r / 0.29) ** 2))
        at = Vector((0.06 + r * math.cos(a), 0.02 + r * math.sin(a), 1.09 + 0.075 * rim + 0.002))
        add_shaped(top, 4, blob(at, AXES, Vector((0.027, 0.027, 0.008))), material=m)
    tilt_about(top, Vector((0.06, 0.02, 1.09)), rx=-0.14, ry=0.38)
    merge_into(bm, top)


def hat_buckethat(bm):
    # a fisherman's bucket hat: a round crown with a flat top, a short brim sloping down all round,
    # and rows of stitching round the brim and the band
    def crown(d):
        q = superellipsoid(d, 3.0)
        w = Vector((0, 0.015, 0.99)) + Vector((q.x * 0.285, q.y * 0.295, q.z * 0.16))
        w.z = 0.975 + soft_floor(w.z - 0.975, 0.008)
        return w

    add_shaped(bm, 16, crown)
    slope = lambda r: -0.11 * max(0.0, (r - 0.27) / 0.12)
    disc(bm, Vector((0, 0.015, 0.975)), 0.2, 0.39, 0.016, lambda r, a: slope(r))
    band(bm, Vector((0, 0.015, 1.0)), 0.29, 0.3, 0.012, 0.024, material=1)
    for r in (0.31, 0.35):
        band(bm, Vector((0, 0.015, 0.975 + slope(r) + 0.009)), r, r + 0.01, 0.0025, 0.0025, segs=72, sides=6, material=1)
    tilt_about(bm, Vector((0, 0.0, 0.975)), rx=-0.12)


def hat_deerstalker(bm):
    # a tweed deerstalker: a snug crown, a peak at the front and another at the back, the ear flaps
    # tied up over the crown with a little bow, and a button on top
    slope = 0.1

    def shape(d):
        q = superellipsoid(d, 2.3)
        w = Vector((0, 0.015, 0.93)) + Vector((q.x * 0.3, q.y * 0.31, q.z * 0.23))
        cut = 0.96 - slope * w.y
        w.z = cut + soft_floor(w.z - cut, 0.01)
        return w

    add_shaped(bm, 18, shape)
    for s in (-1, 1):  # -1: the front peak, 1: the back one, each drooping outward
        peak = bmesh.new()
        add_shaped(peak, 10, blob(Vector((0, s * 0.34 + 0.015, 0.975 - s * 0.012)), AXES, Vector((0.19, 0.1, 0.013)), n=2.4))
        tilt_about(peak, Vector((0, s * 0.27 + 0.015, 0.975)), rx=-s * 0.3)
        paint(peak, 1)
        merge_into(bm, peak)
    for side in (-1, 1):
        add_shaped(bm, 8, blob(Vector((side * 0.29, 0.015, 1.03)), AXES, Vector((0.03, 0.13, 0.085)), n=2.6), material=1)  # an ear flap, folded up
    bow = Vector((0, 0.02, 1.17))
    for side in (-1, 1):
        add_shaped(bm, 6, blob(bow + Vector((side * 0.036, 0, 0)), AXES, Vector((0.032, 0.016, 0.02))), material=1)
        tube(bm, [Vector((side * 0.3, 0.015, 1.09)), Vector((side * 0.2, 0.02, 1.16)), bow + Vector((side * 0.02, 0, 0))], lambda t: 0.004, sides=6, cap_rings=2, material=1)
    add_shaped(bm, 5, blob(bow, AXES, Vector((0.014, 0.014, 0.016))), material=1)


def hat_goldglasses(bm):
    # gold wire-frame glasses: two round rims before the eyes, a bridge arching over the nose, and
    # the arms running back along the sides of the head to the ears
    rims = []
    for s in (-1, 1):
        p, n = HEAD.surf(s * 0.34, EYE_PITCH)
        c = p + n * 0.045
        ring_torus(bm, c, n, 0.066, 0.0062, segs=40, sides=8)
        rims.append((s, c, n))
    (_, cl, _), (_, cr, _) = rims
    mid = (cl + cr) / 2 + Vector((0, -0.012, 0.022))
    tube(bm, [cl.lerp(cr, 0.19), mid, cr.lerp(cl, 0.19)], lambda t: 0.005, sides=6, cap_rings=2)
    for s, c, n in rims:
        out = Vector((s, 0, 0))
        e = (out - n * out.dot(n)).normalized()
        start = c + e * 0.066
        p1, n1 = HEAD.surf(s * 0.95, EYE_PITCH + 0.05)
        p2, n2 = HEAD.surf(s * (EAR_YAW - 0.12), EYE_PITCH + 0.12)
        tube(bm, [start, p1 + n1 * 0.042, p2 + n2 * 0.03], lambda t: 0.0048, sides=6, cap_rings=2)


def hat_pioneercap(bm):
    # the Pioneer Cap: an artisan's beret in washed denim, neat on its band and tipped back to the
    # right, with a miniature brass gear pinned on the band at the left temple
    band(bm, Vector((0, 0.01, 1.03)), 0.182, 0.19, 0.016, 0.018, material=1)
    top = bmesh.new()
    add_shaped(top, 14, blob(Vector((-0.02, 0.02, 1.085)), AXES, Vector((0.26, 0.27, 0.072)), n=2.2))
    tube(top, line(Vector((-0.02, 0.02, 1.145)), Vector((-0.02, 0.02, 1.185)), 4), lambda s: 0.012, sides=10, cap_rings=3)
    tilt_about(top, Vector((-0.02, 0.02, 1.085)), rx=-0.1, ry=-0.28)
    merge_into(bm, top)
    gear = bmesh.new()
    at = Vector((0.172, -0.094, 1.035))
    axis = Vector((0.88, -0.47, 0.06)).normalized()
    at = at + axis * 0.02
    ring_torus(gear, at, axis, 0.026, 0.008, segs=24, sides=6)
    across, through, _ = aim_frame(axis)
    for k in range(8):
        a = 2 * math.pi * k / 8
        radial = across * math.cos(a) + through * math.sin(a)
        add_shaped(gear, 2, blob(at + radial * 0.036, (radial, radial.cross(axis), axis), Vector((0.008, 0.007, 0.006)), n=4.0))
    add_shaped(gear, 3, blob(at, AXES, Vector((0.01, 0.01, 0.01))))
    paint(gear, 2)
    merge_into(bm, gear)


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
    "cozybeanie": (hat_cozybeanie, ("Mat_CozyBeanie", "Mat_CozyRib", "Mat_Pom")),
    "boonie": (hat_boonie, ("Mat_Khaki", "Mat_KhakiBand", "Mat_BobberRed", "Mat_BobberWhite")),
    "bearcap": (hat_bearcap, ("Mat_BearFleece", "Mat_BearInner")),
    "headlamp": (hat_headlamp, ("Mat_Elastic", "Mat_LampBody", "Mat_LampGlow")),
    "frogbeanie": (hat_frogbeanie, ("Mat_Frog", "Mat_FrogCuff", "Mat_BobberWhite", "Mat_Eye", "Mat_Mouth")),
    "catbeanie": (hat_catbeanie, ("Mat_CatKnit", "Mat_CatCuff", "Mat_BunnyInner")),
    "painterberet": (hat_painterberet, ("Mat_PainterBeret", "Mat_BeretBand", "Mat_BobberRed", "Mat_PetalCentre", "Mat_Can")),
    "buckethat": (hat_buckethat, ("Mat_Bucket", "Mat_BucketStitch")),
    "deerstalker": (hat_deerstalker, ("Mat_Tweed", "Mat_TweedDark")),
    "goldglasses": (hat_goldglasses, ("Mat_Crown",)),
    "pioneercap": (hat_pioneercap, ("Mat_PioneerBeret", "Mat_BeretBand", "Mat_Button")),
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
        hat_ob = make_object(f"Hat_{hat}", bm, NECK, coll, head, NECK, [mat[n] for n in names])
        if hat == "bearcap":
            # the bear cap's ears: child nodes of the cap, pivoting where they join it
            for ear, side in (("EarL", 1), ("EarR", -1)):
                bm = bmesh.new()
                bear_ear(bm, side)
                make_object(f"Hat_bearcap_{ear}", bm, Vector((side * 0.2, 0.02, BEAR_EAR_BASE)), coll, hat_ob, NECK, [mat[n] for n in names])

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

    # Legs: skin, pivots at the hips (AVATAR_LEG_RADIUS round there), tapering to the ankle and a
    # bare foot flat on the floor, fused into one form; the outfit's bottom brings the footwear
    legs, hips = {}, {}
    for name, side in (("LegL", 1), ("LegR", -1)):
        hip = Vector((side * LEG_X, 0, hip_y))
        skin = piece(name, lambda bm, side=side: (leg_skin(bm, side, hip_y, leg_r), foot_skin(bm, side)), mat["Mat_Skin"], hip, coll, fuse=LEG_FUSE)
        legs[name], hips[name] = assemble(name, [skin], body, hip, origin), hip

    # Clothes: every top and bottom in pieces on the parts they move with (the runtime shows the
    # outfit's one of each): a top's body on the torso and its sleeves on the arms, a bottom's seat
    # on the body and its legs (with the shoes) on the legs; the fused forms a garment asks for (a
    # shoe's upper, a hood, a bow) are built on their own, fused into clay and joined to its piece
    parts = {"Torso": (torso, TORSO_PIVOT, 0), "Body": (body, origin, 0), "ArmL": (arms["ArmL"], shoulders["ArmL"], 1), "ArmR": (arms["ArmR"], shoulders["ArmR"], -1), "LegL": (legs["LegL"], hips["LegL"], 1), "LegR": (legs["LegR"], hips["LegR"], -1)}
    assert tuple(TOPS) == TOP_IDS and tuple(BOTTOMS) == BOTTOM_IDS
    for kind, table, part_list, extra in (("Top", TOPS, TOP_PARTS, ()), ("Bottom", BOTTOMS, BOTTOM_PARTS, (hip_y, leg_r, hip_off))):
        for garment, (names, build_garment) in table.items():
            mats = [mat[n] for n in names]
            for suffix, parent_name in part_list:
                parent, pivot, side = parts[parent_name]
                FUSED.clear()
                bm = bmesh.new()
                build_garment(bm, suffix, side, *extra)
                if not bm.verts and not FUSED:  # nothing on this part (a tank top's bare arms)
                    bm.free()
                    continue
                node = f"{kind}_{garment}{suffix}"
                pieces = [make_object(node, bm, pivot, coll, None, Vector(), mats)]
                for k, (build_piece, index, fuse) in enumerate(FUSED):
                    pieces.append(piece(f"{node}_fused{k}", build_piece, mats[index], pivot, coll, fuse=fuse))
                assemble(node, pieces, parent, pivot, pivot)

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
DEFAULT_TOP = "hoodie"  # the starter hoodie outfit, with its joggers
DEFAULT_BOTTOM = "joggers"


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
        studio(root, "begin")
        coll = build(hip_y, leg_r, hip_off, hair_covering_ears(root))
        out = os.path.join(root, "client", "public", "models", "avatar.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "hip_y": hip_y, "leg_radius": leg_r, "hip_offset": hip_off, **summary(coll)}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
