"""The Loft's small diorama props: builds client/public/models/props.glb.

Run it inside Blender, through the Live Bridge (it executes the POSTed body as Python):

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/build_props.py

or headless:

    blender -b -P scripts/blender/build_props.py

As with the other builders, define REPO_ROOT (and optionally REPORT_PATH, where a JSON summary or
the traceback is written) in front of the body when it is POSTed without a `__file__`.

Every prop is one object named Prop_<Name>, its origin at the middle of its base (it stands on
whatever it is put on), facing -Y in Blender (+Z in three.js), built to the diorama's scale (a
0.7 counter, a 0.36 seat). The lounge (client/src/scene/LoungeWorld.tsx) places copies of them:

    Prop_Pillow        a plump throw pillow, standing: square with soft dog-eared corners, a
                       gentle pinch in the middle and a seam round its edge (Prop_Fabric is
                       recoloured per pillow)
    Prop_Toaster       a retro pop-up toaster in mint enamel on a chrome base, two slices of bread
                       sticking up out of its slots, a lever at its side
    Prop_Kettle        an enamelled pouring kettle: a round belly, a lid and knob, a spout, and a
                       wooden handle arching over the top
    Prop_DutchOven     an enamelled cast-iron pot: straight sides, a domed lid with a cream knob,
                       a loop ear either side
    Prop_FruitBowl     a ceramic bowl of two lemons, an orange and an apple with a leaf
    Prop_BreadBasket   a woven oval basket holding a scored baguette and two rolls
    Prop_Mug           a ceramic mug of coffee with a handle (Prop_Glaze is recoloured per mug)
    Prop_Radio         a retro tabletop radio in dusty coral: a round speaker grille, a tuning
                       dial with its needle, two walnut knobs, a carry handle and an antenna
    Prop_CoffeeMachine a little retro espresso machine: a terracotta body with a cream crown, a
                       pressure gauge, the group head and its walnut-handled portafilter, a
                       steam wand, and a cup waiting on the chrome drip tray

Every material is matte (roughness 0.75-0.85, metalness 0 except the chrome's 0.1), and every
mesh is closed.
"""

import json
import math
import os
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Props"
NODE_NAMES = ("Prop_Pillow", "Prop_Toaster", "Prop_Kettle", "Prop_DutchOven", "Prop_FruitBowl", "Prop_BreadBasket", "Prop_Mug", "Prop_Radio", "Prop_CoffeeMachine")

# sRGB hex; Prop_Fabric and Prop_Glaze are only defaults (the lounge recolours them)
PALETTE = {
    "Prop_Fabric": "#E3D5BB",
    "Prop_Enamel": "#9CC9B4",
    "Prop_Chrome": "#CFC8BB",
    "Prop_Slot": "#3A3A3E",
    "Prop_Crust": "#C98D4A",
    "Prop_Crumb": "#F3DFAE",
    "Prop_Cream": "#EFE4CF",
    "Prop_Walnut": "#5A3A24",
    "Prop_Terracotta": "#C4714A",
    "Prop_Lemon": "#E8C547",
    "Prop_Orange": "#E8913A",
    "Prop_Apple": "#C8483C",
    "Prop_Leaf": "#6D9A5E",
    "Prop_Wicker": "#B98A52",
    "Prop_Loaf": "#D9A05B",
    "Prop_Glaze": "#EFE4CF",
    "Prop_Coffee": "#4A2E1C",
    "Prop_RadioBody": "#D98E6E",
    "Prop_Grille": "#F3E3C3",
    "Prop_Needle": "#C8483C",
}
ROUGHNESS = {"Prop_Chrome": 0.7, "Prop_Enamel": 0.72, "Prop_Cream": 0.72, "Prop_Glaze": 0.72, "Prop_Terracotta": 0.74}
METALLIC = {"Prop_Chrome": 0.1}


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def superellipsoid(d, n):
    """The point of a superellipsoid |x|^n + |y|^n + |z|^n = 1 in direction d."""
    s = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
    return d / s


# ---------------------------------------------------------------------------------------------
# mesh builders (each adds closed geometry to a bmesh, faces in material slot `material`)


def add_shaped(bm, cuts, shape, material=0):
    """A quad sphere, its every vertex moved to shape(direction)."""
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


def blob(centre, half, n=2.0, axes=(Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))):
    ex, ey, ez = axes

    def shape(d):
        q = superellipsoid(d, n)
        return centre + ex * (q.x * half.x) + ey * (q.y * half.y) + ez * (q.z * half.z)

    return shape


def lathe(bm, profile, segs=40, material=0, squash=(1.0, 1.0), ridge=None, offset=Vector()):
    """A solid of revolution round Z through (r, z) points, bottom centre to top centre (both r=0);
    `squash` scales it in x and y (an oval basket), ridge(z, angle) nudges the radius (a weave)."""
    faces = []
    bottom = bm.verts.new(offset + Vector((0, 0, profile[0][1])))
    top = bm.verts.new(offset + Vector((0, 0, profile[-1][1])))
    rings = []
    for r, z in profile[1:-1]:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rr = r * (1 + (ridge(z, a) if ridge else 0.0))
            ring.append(bm.verts.new(offset + Vector((rr * math.cos(a) * squash[0], rr * math.sin(a) * squash[1], z))))
        rings.append(ring)
    for k in range(segs):
        k1 = (k + 1) % segs
        faces.append(bm.faces.new((bottom, rings[0][k1], rings[0][k])))
        faces.append(bm.faces.new((top, rings[-1][k], rings[-1][k1])))
        for r0, r1 in zip(rings, rings[1:]):
            faces.append(bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])))
    for f in faces:
        f.material_index = material


def arc_lengths(path):
    out = [0.0]
    for a, b in zip(path, path[1:]):
        out.append(out[-1] + (b - a).length)
    return out


def tube(bm, path, radius, sides=14, material=0):
    """A round tube along `path` (radius(s), s = 0..1 of its length), closed in rounded caps."""
    lengths = arc_lengths(path)
    total = lengths[-1]
    last = len(path) - 1
    tangents = [(path[min(last, i + 1)] - path[max(0, i - 1)]).normalized() for i in range(len(path))]
    normal = tangents[0].orthogonal().normalized()
    rings = []
    for i, (p, t) in enumerate(zip(path, tangents)):
        normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        r = radius(lengths[i] / total)
        rings.append([bm.verts.new(p + (normal * math.cos(a) + binormal * math.sin(a)) * r) for a in (2 * math.pi * k / sides for k in range(sides))])
    start = bm.verts.new(path[0] - tangents[0] * radius(0.0) * 0.8)
    end = bm.verts.new(path[-1] + tangents[-1] * radius(1.0) * 0.8)
    faces = []
    for k in range(sides):
        k1 = (k + 1) % sides
        faces.append(bm.faces.new((start, rings[0][k1], rings[0][k])))
        faces.append(bm.faces.new((end, rings[-1][k], rings[-1][k1])))
        for r0, r1 in zip(rings, rings[1:]):
            faces.append(bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])))
    for f in faces:
        f.material_index = material


def prism(bm, outline, y0, y1, material=0):
    """A flat slab: the XZ `outline` (counter-clockwise) extruded from y0 to y1."""
    front = [bm.verts.new((x, y0, z)) for x, z in outline]
    back = [bm.verts.new((x, y1, z)) for x, z in outline]
    faces = [bm.faces.new(front), bm.faces.new(list(reversed(back)))]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((front[i], front[j], back[j], back[i])))
    for f in faces:
        f.material_index = material


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return p0 * u**3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t**3


# ---------------------------------------------------------------------------------------------
# the props


def pillow(bm):
    """A plump throw pillow standing on its edge: 0.36 square and about 0.16 through at its
    fullest. Its sides curve in a little between the corners (the dog ears of a stuffed case), it
    swells toward the middle and dips in a gentle pinch there (a sewn tuft), and front and back
    meet in a seam all round."""
    n = 28
    half = 0.18

    def at(u, v):
        x = u * half * (1 - 0.07 * (1 - v * v))
        z = half + v * half * (1 - 0.07 * (1 - u * u))
        t = 0.085 * ((1 - u * u) * (1 - v * v)) ** 0.6 * (1 - 0.26 * math.exp(-(u * u + v * v) / 0.06))
        return x, z, t

    grid = {}
    for i in range(n + 1):
        for j in range(n + 1):
            u, v = -1 + 2 * i / n, -1 + 2 * j / n
            x, z, t = at(u, v)
            if i in (0, n) or j in (0, n):
                grid[i, j] = (bm.verts.new((x, 0, z)),) * 2
            else:
                grid[i, j] = (bm.verts.new((x, -t, z)), bm.verts.new((x, t, z)))
    for i in range(n):
        for j in range(n):
            quad = [grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]]
            bm.faces.new([q[0] for q in quad])
            back = [q[1] for q in reversed(quad)]
            if len(set(back)) == 4:
                bm.faces.new(back)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)


def bread_outline(half_w=0.078, z0=0.15, z_top=0.275):
    """A slice of bread from the side: square shoulders under a rounded, overhanging crown."""
    pts = [(-half_w, z0), (half_w, z0), (half_w, z_top - 0.04)]
    for k in range(13):
        a = math.pi * k / 12
        pts.append((math.cos(a) * (half_w + 0.012), z_top - 0.03 + math.sin(a) * 0.03 * (1 + 0.3 * math.sin(a))))
    pts.append((-half_w, z_top - 0.04))
    return pts


def toaster(bm):
    add_shaped(bm, 10, blob(Vector((0, 0, 0.117)), Vector((0.15, 0.085, 0.095)), n=3.2), material=0)
    add_shaped(bm, 6, blob(Vector((0, 0, 0.012)), Vector((0.158, 0.092, 0.013)), n=4.0), material=1)
    for y in (-0.03, 0.03):
        add_shaped(bm, 4, blob(Vector((0, y, 0.21)), Vector((0.1, 0.017, 0.005)), n=4.0), material=2)
        outline = bread_outline()
        prism(bm, outline, y - 0.011, y + 0.011, material=3)
        inset = [(x * 0.86, 0.15 + (z - 0.15) * 0.9) for x, z in outline]
        prism(bm, inset, y - 0.0125, y + 0.0125, material=4)
    # the lever and its knob, on the right-hand side
    add_shaped(bm, 4, blob(Vector((0.158, 0, 0.16)), Vector((0.012, 0.02, 0.01)), n=4.0), material=1)
    add_shaped(bm, 6, blob(Vector((0.172, 0, 0.16)), Vector((0.012, 0.024, 0.014))), material=2)


def kettle(bm):
    body = [(0, 0), (0.085, 0), (0.1, 0.02), (0.108, 0.06), (0.1, 0.1), (0.078, 0.135), (0.062, 0.148), (0.06, 0.155), (0.05, 0.172), (0.028, 0.181), (0, 0.183)]
    lathe(bm, body, segs=40, material=0)
    add_shaped(bm, 6, blob(Vector((0, 0, 0.196)), Vector((0.018, 0.018, 0.016))), material=1)
    spout = [bezier(Vector((0.06, 0, 0.05)), Vector((0.13, 0, 0.07)), Vector((0.15, 0, 0.12)), Vector((0.178, 0, 0.155)), i / 16) for i in range(17)]
    tube(bm, spout, lambda s: 0.024 - 0.012 * s, material=0)
    handle = [bezier(Vector((-0.07, 0, 0.135)), Vector((-0.08, 0, 0.26)), Vector((0.06, 0, 0.26)), Vector((0.055, 0, 0.14)), i / 20) for i in range(21)]
    tube(bm, handle, lambda s: 0.011, material=1)


def dutch_oven(bm):
    lathe(bm, [(0, 0), (0.118, 0), (0.132, 0.014), (0.135, 0.06), (0.131, 0.096), (0, 0.098)], segs=44, material=0)
    lathe(bm, [(0, 0.094), (0.137, 0.094), (0.138, 0.104), (0.12, 0.118), (0.07, 0.129), (0, 0.132)], segs=44, material=0)
    lathe(bm, [(0, 0.126), (0.022, 0.126), (0.019, 0.14), (0.028, 0.152), (0.02, 0.16), (0, 0.161)], segs=24, material=1)
    for side in (-1, 1):
        ear = [Vector((side * (0.128 + 0.032 * math.sin(a)), 0.034 * math.cos(a), 0.078)) for a in (math.pi * i / 12 for i in range(13))]
        tube(bm, ear, lambda s: 0.009, material=0)


def fruit_bowl(bm):
    lathe(bm, [(0, 0), (0.06, 0), (0.066, 0.01), (0.13, 0.05), (0.156, 0.075), (0.15, 0.081), (0.138, 0.074), (0.06, 0.02), (0, 0.018)], segs=44, material=0)

    def lemon(centre, yaw):
        along = Vector((math.cos(yaw), math.sin(yaw), 0))
        across = Vector((-math.sin(yaw), math.cos(yaw), 0))

        def shape(d):
            q = superellipsoid(d, 2.0)
            tip = 1 + 0.18 * abs(q.x) ** 8  # the little nubs at each end
            return centre + along * q.x * 0.05 * tip + across * q.y * 0.036 + Vector((0, 0, q.z * 0.034))

        return shape

    add_shaped(bm, 8, lemon(Vector((-0.045, 0.02, 0.07)), 0.4), material=1)
    add_shaped(bm, 8, lemon(Vector((0.05, 0.035, 0.07)), -0.9), material=1)
    add_shaped(bm, 8, blob(Vector((0.0, -0.045, 0.074)), Vector((0.043, 0.043, 0.04))), material=2)

    def apple(centre):
        def shape(d):
            q = superellipsoid(d, 2.0) * 0.042
            q.z *= 0.92
            q.z -= 0.012 * math.exp(-((d.x * d.x + d.y * d.y) / 0.03)) * (1 if d.z > 0 else 0)  # the dimple
            return centre + q

        return shape

    add_shaped(bm, 8, apple(Vector((0.012, 0.03, 0.112))), material=3)
    tube(bm, [Vector((0.012, 0.03, 0.135)), Vector((0.016, 0.03, 0.15)), Vector((0.022, 0.03, 0.158))], lambda s: 0.004, sides=8, material=4)
    add_shaped(bm, 6, blob(Vector((0.04, 0.03, 0.152)), Vector((0.022, 0.012, 0.004)), axes=(Vector((0.9, 0, 0.44)).normalized(), Vector((0, 1, 0)), Vector((-0.44, 0, 0.9)).normalized())), material=5)


def bread_basket(bm):
    weave = lambda z, a: 0.03 * math.sin(z * 170) + 0.015 * math.sin(a * 18 + z * 90)
    lathe(bm, [(0, 0), (0.1, 0), (0.108, 0.01), (0.13, 0.05), (0.142, 0.07), (0.134, 0.076), (0.12, 0.066), (0.1, 0.018), (0, 0.016)], segs=48, material=0, squash=(1.0, 0.72), ridge=weave)
    # a baguette lying across it, one end propped up on the rim and poking out, and two rolls
    # nestled in front, all riding well above the rim
    baguette = [Vector((-0.17 + 0.34 * i / 16, 0.02 - 0.02 * i / 16, 0.085 + 0.05 * (i / 16) ** 1.5)) for i in range(17)]
    tube(bm, baguette, lambda s: 0.03 * (0.82 + 0.18 * math.sin(math.pi * s)) * (1 + 0.07 * math.sin(s * math.pi * 12)), sides=16, material=1)
    for x, y in ((-0.06, -0.035), (0.045, -0.04)):
        add_shaped(bm, 8, blob(Vector((x, y, 0.08)), Vector((0.042, 0.038, 0.032))), material=1)


def mug(bm):
    lathe(bm, [(0, 0), (0.04, 0), (0.043, 0.006), (0.044, 0.088), (0.041, 0.092), (0.037, 0.089), (0.036, 0.078), (0, 0.078)], segs=36, material=0)
    lathe(bm, [(0, 0.074), (0.0365, 0.074), (0.0365, 0.079), (0, 0.079)], segs=36, material=1)
    handle = [Vector((0.04 + 0.03 * math.sin(a), 0, 0.048 + 0.026 * math.cos(a))) for a in (math.pi * i / 14 for i in range(15))]
    tube(bm, handle, lambda s: 0.0085, sides=10, material=0)


def radio(bm):
    """A retro tabletop radio, 0.28 wide: a soft coral cabinet, a round speaker grille (cream, with
    raised slats) on the left of its face, a tuning dial with a red needle and two walnut knobs on
    the right, a chrome carry handle over the top and an antenna leaning out of its shoulder."""
    add_shaped(bm, 10, blob(Vector((0, 0, 0.09)), Vector((0.14, 0.065, 0.08)), n=3.4), material=0)
    add_shaped(bm, 4, blob(Vector((0, 0, 0.006)), Vector((0.12, 0.05, 0.008)), n=4.0), material=3)  # the plinth it stands on
    face = -0.063
    # the speaker: a cream disc with five raised slats across it
    grille_c = Vector((-0.06, face, 0.09))
    add_shaped(bm, 8, blob(grille_c, Vector((0.05, 0.006, 0.05)), axes=(Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))), material=1)
    for k in range(-2, 3):
        half = math.sqrt(max(0.0, 0.043**2 - (k * 0.016) ** 2))
        add_shaped(bm, 3, blob(grille_c + Vector((0, -0.006, k * 0.016)), Vector((half, 0.003, 0.004)), n=4.0), material=0)
    # the dial window and its needle, the two knobs under it
    dial = Vector((0.07, face, 0.12))
    add_shaped(bm, 6, blob(dial, Vector((0.048, 0.005, 0.02)), n=4.0), material=1)
    add_shaped(bm, 3, blob(dial + Vector((0.008, -0.005, 0)), Vector((0.002, 0.002, 0.016)), n=4.0), material=2)
    for dx in (0.045, 0.095):
        tube(bm, [Vector((dx, face + 0.002, 0.06)), Vector((dx, face - 0.016, 0.06))], lambda s_: 0.014, sides=16, material=3)
    # the carry handle and the antenna
    handle = [Vector((-0.1 + 0.2 * i / 16, 0.0, 0.165 + 0.05 * math.sin(math.pi * i / 16))) for i in range(17)]
    tube(bm, handle, lambda s_: 0.007, sides=10, material=4)
    antenna = [Vector((0.1, 0.03, 0.16)) + Vector((0.07, 0.02, 0.2)) * (i / 10) for i in range(11)]
    tube(bm, antenna, lambda s_: 0.0035, sides=8, material=4)
    add_shaped(bm, 5, blob(antenna[-1], Vector((0.008, 0.008, 0.008))), material=4)


def coffee_machine(bm):
    """A little retro espresso machine, 0.22 wide: a terracotta body with a cream crown, a cream
    pressure gauge on its face, the group head with a walnut-handled portafilter jutting out, a
    steam wand at its side, and a small cup waiting on the chrome drip tray."""
    add_shaped(bm, 10, blob(Vector((0, 0.02, 0.15)), Vector((0.11, 0.1, 0.14)), n=3.6), material=0)
    add_shaped(bm, 8, blob(Vector((0, 0.02, 0.29)), Vector((0.1, 0.09, 0.025)), n=3.0), material=1)  # the cream crown
    # the gauge: a cream disc with a dark needle
    add_shaped(bm, 8, blob(Vector((0.0, -0.08, 0.235)), Vector((0.03, 0.006, 0.03))), material=1)
    add_shaped(bm, 3, blob(Vector((0.006, -0.087, 0.24)), Vector((0.012, 0.002, 0.002)), n=4.0), material=3)
    # the group head, and the portafilter locked into it
    tube(bm, [Vector((0, -0.07, 0.15)), Vector((0, -0.105, 0.15))], lambda s_: 0.03, sides=18, material=2)
    tube(bm, [Vector((0, -0.1, 0.13)), Vector((0, -0.17, 0.12))], lambda s_: 0.011, sides=12, material=3)
    # the steam wand
    wand = [Vector((0.105, -0.03, 0.2)), Vector((0.13, -0.05, 0.19)), Vector((0.135, -0.07, 0.12)), Vector((0.13, -0.075, 0.08))]
    tube(bm, [bezier(*wand, i / 12) for i in range(13)], lambda s_: 0.006, sides=8, material=2)
    # the drip tray, and a cup waiting on it
    add_shaped(bm, 4, blob(Vector((0, -0.09, 0.012)), Vector((0.08, 0.05, 0.012)), n=4.0), material=2)
    lathe(bm, [(0, 0.024), (0.022, 0.024), (0.026, 0.03), (0.027, 0.07), (0, 0.07)], segs=24, material=1, offset=Vector((0, -0.09, 0)))


PROPS = {
    "Prop_Pillow": (pillow, ("Prop_Fabric",)),
    "Prop_Toaster": (toaster, ("Prop_Enamel", "Prop_Chrome", "Prop_Slot", "Prop_Crust", "Prop_Crumb")),
    "Prop_Kettle": (kettle, ("Prop_Cream", "Prop_Walnut")),
    "Prop_DutchOven": (dutch_oven, ("Prop_Terracotta", "Prop_Cream")),
    "Prop_FruitBowl": (fruit_bowl, ("Prop_Cream", "Prop_Lemon", "Prop_Orange", "Prop_Apple", "Prop_Walnut", "Prop_Leaf")),
    "Prop_BreadBasket": (bread_basket, ("Prop_Wicker", "Prop_Loaf")),
    "Prop_Mug": (mug, ("Prop_Glaze", "Prop_Coffee")),
    "Prop_Radio": (radio, ("Prop_RadioBody", "Prop_Grille", "Prop_Needle", "Prop_Walnut", "Prop_Chrome")),
    "Prop_CoffeeMachine": (coffee_machine, ("Prop_Terracotta", "Prop_Cream", "Prop_Chrome", "Prop_Walnut")),
}


# ---------------------------------------------------------------------------------------------
# scene plumbing


def purge():
    """Remove the previous build: the Props collection and everything in it (nothing else)."""
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
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass  # Blender 5: materials always have a node tree
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = lin(PALETTE[name])
    rough = ROUGHNESS.get(name, 0.82)
    metal = METALLIC.get(name, 0.0)
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*c, 1)
    m.roughness = rough
    m.use_backface_culling = True
    return m


def build():
    purge()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    assert tuple(PROPS) == NODE_NAMES
    for i, (name, (make, mats)) in enumerate(PROPS.items()):
        bm = bmesh.new()
        make(bm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name + "Mesh")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        for m in mats:
            me.materials.append(material(m))
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.location = (0.6 * i, 3.0, 0)  # laid out in a row in the viewport; the lounge places copies
    return coll


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False)
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
    out = {}
    for o in coll.all_objects:
        ws = [v.co for v in o.data.vertices]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "size": [round(max(w[k] for w in ws) - min(w[k] for w in ws), 3) for k in range(3)], "materials": [m.name for m in o.data.materials]}
    return out


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_props.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        coll = build()
        out = os.path.join(root, "client", "public", "models", "props.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "props": summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
