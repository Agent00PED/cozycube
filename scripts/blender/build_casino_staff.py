"""The Velvet Casino's staff, regulars and crowd: builds boris.glb, vivienne.glb, jasper.glb,
pippin.glb, bruno.glb and patrons.glb in client/public/models/ (ONLY, a list of those names set in
the namespace, builds just those).

Run it inside Blender through the Live Bridge (POST {"code": ...}; queued, nothing comes back, and
it execs with separate globals and locals, so run this file inside a namespace of its own with
REPO_ROOT and REPORT_PATH set in it: the summary or the traceback goes to REPORT_PATH), or
headless:

    blender -b -P scripts/blender/build_casino_staff.py

Four chibi animals in Barnaby, Buster and Mr. Vance's proportions, built the way Mr. Vance is
(scripts/blender/build_vance.py): every colour a vertex colour and each node ONE matte clay
material, so each costs a draw call per node (five). Each stands (or sits) at its own origin facing
+z, posed for its spot in shared/worlds/casino.ts (the game places, turns and, for Pippin, lifts
it), with the nodes entities/CampNpc.tsx animates:

    <Name>              the root (an empty at the feet)
      <Name>_Body       everything that holds still (Jasper's stool, Pippin's cocktail on the bar)
        <Name>_Head     pivots at the neck: they look at whoever comes near
        <Name>_ArmR     pivots at the shoulder: they wave with it
        <Name>_ArmL     pivots at the shoulder (Vivienne's chip rake, Jasper's paw on his lever,
                        Pippin's cocktail shaker, Boris's cards)
        <Name>_Tail     pivots where it joins: it sways

    Boris       a big polar bear dealer in a black tuxedo vest and bow tie, paws on the poker felt
    Vivienne    a cream poodle croupier (topknot, ear and cuff pom-poms, a pearl necklace, a green
                croupier's waistcoat), her brass chip rake laid across the roulette felt
    Jasper      a black-and-white tuxedo cat with yellow eyes and a red bow tie, perched on a
                velvet stool at his gold slot machine, a paw on its lever, his tail curled up
    Pippin      a penguin mixologist (a burgundy bow tie), flippers on the bar, a shaker in one,
                a cocktail with a cherry on the counter in front of him
    Bruno       a bulldog bouncer in a black suit and dark glasses, an earpiece coiled to his
                collar, arms folded, beside the VIP room's doors

The crowd (patrons.glb) is three archetypes the game instances by the dozen: an evening-gowned
rabbit, a raccoon in a tailored suit and a dapper badger in a waistcoat and bowler. Each is two
nodes at the origin, facing +z, feet on the floor, and no rig (the game moves them whole):

    Patron_<Kind>_Fur      the animal, and what keeps its own colour (pearls, a collar, a bow tie)
    Patron_<Kind>_Outfit   the clothes, painted in pale greys: the game tints each patron's own
                           (a gown in ruby or sapphire, a suit in navy, a waistcoat in tweed)

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

MATERIAL = "ST_Clay"

PALETTE = {
    # shared
    "Eye": "#1B1818",
    "Glint": "#FFFFFF",
    "Nose": "#1E1A1A",
    "Blush": "#E8A09A",
    "Brass": "#D4A548",
    "Black": "#151214",
    # Boris
    "BearFur": "#F2EFE8",
    "BearShade": "#D8D2C5",
    "TuxVest": "#1A171A",
    "TuxShirt": "#E9EEF3",
    "Trousers": "#201C20",
    "Card": "#F4EFE4",
    "CardRed": "#B3202E",
    # Vivienne
    "Coat": "#F1E6D2",
    "CoatShade": "#DDCFB4",
    "Pearl": "#FBF8F0",
    "Waistcoat": "#1F5A3F",
    "RakeWood": "#6B3A22",
    # Jasper
    "CatBlack": "#1C1A1F",
    "CatWhite": "#F4F1EA",
    "CatEye": "#F2C12E",
    "CatNose": "#E39A9A",
    "EarPink": "#D98A8A",
    "BowRed": "#B3202E",
    "Velvet": "#7A1E2E",
    # Pippin
    "PenBlack": "#1E2128",
    "PenWhite": "#F6F5F0",
    "Beak": "#F2A33A",
    "BowBurgundy": "#7A1E2E",
    "Chrome": "#C9C4BA",
    "Glass": "#E6EFEF",
    "Drink": "#D9873A",
    "Cherry": "#C2263A",
    # Bruno
    "Fawn": "#C99A6B",
    "FawnWhite": "#F2E8DA",
    "FawnDark": "#8A5E3C",
    "FawnShade": "#A87C52",
    "Suit": "#1B1B22",
    "SuitShade": "#26262F",
    "Mouth": "#5A2A2A",
    "Tooth": "#FBF8F0",
    "Coil": "#D8D8D8",
    # the crowd: fur in its own colours, clothes in pale greys (the game tints them)
    "PatFurWhite": "#F1EFEA",
    "PatFurGrey": "#9A9690",
    "PatFurDark": "#2A2728",
    "PatPink": "#E7B3B3",
    "PatCloth": "#E6E6E6",
    "PatClothShade": "#BDBDBD",
    "PatClothLight": "#FAFAFA",
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
    if "__file__" in globals() and __file__.endswith("build_casino_staff.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "casino.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


# ---------------------------------------------------------------------------------------------
# shapes: each adds faces to a Part in a colour slot `c` (a name from PALETTE)


class Part:
    def __init__(self):
        self.bm = bmesh.new()
        self.colours = []

    def c(self, name):
        if name not in self.colours:
            self.colours.append(name)
        return self.colours.index(name)


def slab(P, outline, y0, y1, c):
    bm, m = P.bm, P.c(c)
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = m
    bm.faces.new(hi).material_index = m
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = m


def box(P, x0, x1, y0, y1, z0, z1, c):
    slab(P, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, c)


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
    for ring in (ring_a, list(reversed(ring_b))):
        bm.faces.new(ring).material_index = m


def lathe(P, cx, cz, profile, c, segs=14, y0=0.0):
    bm, m = P.bm, P.c(c)
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


def blob(P, cx, cy, cz, hx, hy, hz, c, cuts=3, n=2.2, top=None, bottom=None, tilt=0.0, fluff=0.0):
    """A rounded lump (a superellipsoid) centred at (cx, cy, cz), optionally cut flat at `top` /
    `bottom`, leaned forward by `tilt` (radians about x), and roughened by `fluff` (a pom-pom)."""
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
        bump = 1 + fluff * math.sin(7.3 * d.x + 1.1) * math.sin(6.1 * d.y + 0.4) * math.sin(5.7 * d.z + 2.2)
        x, y, z = q.x * hx * bump, q.z * hy * bump, -q.y * hz * bump
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


def lerp(a, b, t):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


# ---------------------------------------------------------------------------------------------
# Blender plumbing: one vertex-coloured clay material for every node


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
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = 0.8
    m.use_backface_culling = True
    return m


def node(name, P, coll, parent=None, pivot=(0.0, 0.0, 0.0)):
    """The part `P` as a mesh object `name`, origin at the game point `pivot`, under `parent`: each
    face painted its slot's colour, all in the one clay material."""
    bm = P.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    rgba = [(*lin(PALETTE[c]), 1.0) for c in P.colours]
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
    ob["pivot"] = list(pivot)
    if parent is None:
        ob.location = W(*pivot)
    else:
        ob.parent = parent
        pp = parent["pivot"]
        ob.location = W(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2])
    return ob


def rig(name):
    purge(name)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    coll.objects.link(root)
    root["pivot"] = [0.0, 0.0, 0.0]
    return coll, root


def eyes(P, x, y, z, hx, hy, eye="Eye", glint=True, pupil=None):
    for sx in (-1, 1):
        blob(P, sx * x, y, z, hx, hy, 0.02, eye, cuts=2)
        if pupil:
            blob(P, sx * x, y, z + 0.012, hx * 0.3, hy * 0.8, 0.012, pupil, cuts=1)
        if glint:
            blob(P, sx * x - 0.008, y + hy * 0.35, z + 0.018, 0.008, 0.008, 0.005, "Glint", cuts=1)


def arm(P, shoulder, elbow, paw, sleeve, fur, r=0.055, paw_size=0.055, paw_colour=None):
    """An upper arm (its sleeve) to the elbow, a forearm to the paw, the paw."""
    cylinder(P, shoulder, elbow, r, sleeve, r_end=r * 0.92)
    blob(P, elbow[0], elbow[1], elbow[2], r * 0.95, r * 0.95, r * 0.95, sleeve, cuts=2)
    cylinder(P, elbow, paw, r * 0.85, fur, r_end=r * 0.78)
    blob(P, paw[0], paw[1], paw[2], paw_size, paw_size * 0.75, paw_size * 1.1, paw_colour or fur, cuts=2)


# ---------------------------------------------------------------------------------------------
# Boris: the polar bear dealer. The poker table's edge is 0.35 in front of him; its felt at 0.68.


def build_boris(L):
    coll, root = rig("Boris")
    p = L["poker"]
    edge = (L["npcs"]["boris"]["z"] - (p["z"] - p["w"] / 2)) * -1  # the table's near edge, ahead of him
    felt = p["top"] + 0.05
    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.14, 0.16, 0.0, 0.11, 0.16, 0.11, "Trousers")
        blob(B, sx * 0.15, 0.04, 0.08, 0.1, 0.045, 0.14, "Black", bottom=0.0)
    blob(B, 0.0, 0.54, 0.0, 0.31, 0.31, 0.27, "BearFur", cuts=4)
    blob(B, 0.0, 0.33, 0.0, 0.315, 0.12, 0.275, "Trousers", top=0.4)
    blob(B, 0.0, 0.52, -0.01, 0.325, 0.25, 0.285, "TuxVest", cuts=4, top=0.72, bottom=0.36)
    blob(B, 0.0, 0.6, 0.17, 0.11, 0.12, 0.12, "TuxShirt")  # the shirt front in the vest's V
    blob(B, 0.0, 0.76, 0.12, 0.14, 0.06, 0.13, "BearFur")  # the white fur at the collar
    for sx in (-1, 1):
        blob(B, sx * 0.06, 0.745, 0.235, 0.055, 0.032, 0.02, "Black", cuts=2)  # a bow of the tie
    blob(B, 0.0, 0.745, 0.25, 0.024, 0.026, 0.018, "Black", cuts=2)
    for k, y in enumerate((0.56, 0.49, 0.42)):
        blob(B, 0.09, y, 0.27 - k * 0.006, 0.018, 0.018, 0.01, "Brass", cuts=2)
    body = node("Boris_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.78, 0.0)
    blob(H, 0.0, 1.0, 0.0, 0.27, 0.24, 0.25, "BearFur", cuts=4)
    blob(H, 0.0, 0.93, 0.19, 0.13, 0.09, 0.11, "BearShade")
    blob(H, 0.0, 0.975, 0.3, 0.05, 0.036, 0.03, "Nose", cuts=2)
    eyes(H, 0.1, 1.045, 0.215, 0.026, 0.032)
    for sx in (-1, 1):
        blob(H, sx * 0.2, 1.2, -0.02, 0.085, 0.075, 0.05, "BearFur")
        blob(H, sx * 0.2, 1.2, 0.01, 0.048, 0.042, 0.02, "BearShade", cuts=2)
        blob(H, sx * 0.17, 0.95, 0.19, 0.035, 0.02, 0.015, "Blush", cuts=1)
    node("Boris_Head", H, coll, body, neck)

    for sx, name in ((-1, "Boris_ArmR"), (1, "Boris_ArmL")):
        A = Part()
        shoulder = (sx * 0.28, 0.7, 0.03)
        elbow = (sx * 0.37, 0.6, 0.2)
        paw = (sx * 0.2, felt, edge + 0.16)
        arm(A, shoulder, elbow, paw, "TuxShirt", "BearFur", r=0.075, paw_size=0.075)
        if sx > 0:
            # a fanned hand of cards by the left paw
            for k in range(3):
                a = -0.35 + k * 0.35
                cx, cz = paw[0] - 0.12 + 0.05 * math.sin(a), paw[2] + 0.03 * math.cos(a)
                cylinder(A, (cx, felt + 0.005, cz), (cx + 0.06 * math.sin(a), felt + 0.01, cz + 0.1), 0.028, "Card" if k != 1 else "CardRed", sides=4)
        node(name, A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.34, -0.28, 0.08, 0.07, 0.06, "BearFur")
    node("Boris_Tail", T, coll, body, (0.0, 0.34, -0.24))
    return coll


# ---------------------------------------------------------------------------------------------
# Madame Vivienne: the poodle croupier. The roulette table's edge is 0.45 in front of her; its felt
# at 0.78; the wheel's centre 0.9 ahead. Her rake lies across the felt to her left of the wheel.


def build_vivienne(L):
    coll, root = rig("Vivienne")
    r = L["roulette"]
    v = L["npcs"]["vivienne"]
    edge = (r["x"] - r["len"] / 2) - v["x"]  # the table's near edge, ahead of her
    felt = r["top"] + 0.01
    B = Part()
    for sx in (-1, 1):
        cylinder(B, (sx * 0.08, 0.3, 0.0), (sx * 0.09, 0.08, 0.02), 0.045, "Coat", r_end=0.04)
        blob(B, sx * 0.09, 0.07, 0.03, 0.08, 0.07, 0.085, "Coat", cuts=3, fluff=0.12)  # an ankle pom
    blob(B, 0.0, 0.44, 0.0, 0.2, 0.22, 0.18, "Coat", cuts=4)
    blob(B, 0.0, 0.42, 0.0, 0.212, 0.16, 0.19, "Waistcoat", cuts=4, top=0.54, bottom=0.28)
    blob(B, 0.0, 0.6, 0.05, 0.2, 0.1, 0.16, "Coat", cuts=3, fluff=0.1)  # the ruff at her chest
    for k in range(11):  # the pearl necklace, round the front of her neck
        a = math.radians(-100 + 20 * k)
        blob(B, 0.13 * math.sin(a), 0.6 - 0.025 * math.cos(a) ** 2, 0.02 + 0.13 * math.cos(a), 0.018, 0.018, 0.018, "Pearl", cuts=1)
    for k, y in enumerate((0.46, 0.4, 0.34)):
        blob(B, 0.07, y, 0.19 - k * 0.004, 0.014, 0.014, 0.008, "Brass", cuts=1)
    body = node("Vivienne_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.64, 0.0)
    blob(H, 0.0, 0.84, 0.0, 0.17, 0.16, 0.16, "Coat", cuts=4)
    blob(H, 0.0, 0.79, 0.15, 0.075, 0.06, 0.11, "Coat")
    blob(H, 0.0, 0.8, 0.265, 0.035, 0.028, 0.025, "Nose", cuts=2)
    eyes(H, 0.07, 0.86, 0.14, 0.022, 0.028)
    blob(H, 0.0, 1.03, -0.02, 0.16, 0.13, 0.15, "Coat", cuts=3, fluff=0.13)  # the topknot
    blob(H, 0.1, 1.08, 0.08, 0.028, 0.028, 0.028, "Pearl", cuts=1)  # a pearl clip in it
    for sx in (-1, 1):
        blob(H, sx * 0.18, 0.76, -0.01, 0.075, 0.16, 0.065, "CoatShade", cuts=3, fluff=0.12)  # a long ear
        blob(H, sx * 0.12, 0.8, 0.14, 0.03, 0.018, 0.012, "Blush", cuts=1)
    node("Vivienne_Head", H, coll, body, neck)

    for sx, name in ((-1, "Vivienne_ArmR"), (1, "Vivienne_ArmL")):
        A = Part()
        shoulder = (sx * 0.18, 0.55, 0.03)
        elbow = (sx * 0.24, 0.48, 0.15)
        paw = (sx * 0.14, felt + 0.01, edge + 0.04)  # on the table's rim
        arm(A, shoulder, elbow, paw, "Coat", "Coat", r=0.045, paw_size=0.05)
        blob(A, lerp(elbow, paw, 0.8)[0], lerp(elbow, paw, 0.8)[1], lerp(elbow, paw, 0.8)[2], 0.06, 0.06, 0.06, "Coat", cuts=2, fluff=0.12)  # a cuff pom
        if sx > 0:
            # the chip rake: a long wooden handle from her paw across the felt, a brass T at its end
            tip = (0.55, felt + 0.02, edge + 0.55)
            cylinder(A, paw, tip, 0.012, "RakeWood", sides=6)
            d = Vector((tip[0] - paw[0], 0.0, tip[2] - paw[2])).normalized()
            across = (d.z, 0.0, -d.x)
            a = (tip[0] - across[0] * 0.16, tip[1], tip[2] - across[2] * 0.16)
            b = (tip[0] + across[0] * 0.16, tip[1], tip[2] + across[2] * 0.16)
            cylinder(A, a, b, 0.016, "Brass", sides=6)
        node(name, A, coll, body, shoulder)

    T = Part()
    cylinder(T, (0.0, 0.34, -0.17), (0.0, 0.48, -0.27), 0.03, "Coat", sides=8)
    blob(T, 0.0, 0.52, -0.29, 0.08, 0.08, 0.08, "Coat", cuts=3, fluff=0.14)
    node("Vivienne_Tail", T, coll, body, (0.0, 0.34, -0.17))
    return coll


# ---------------------------------------------------------------------------------------------
# Jasper: the tuxedo cat on his stool at his gold machine. The machine's front is 0.4 ahead; its
# lever (at the front corner, to his left) tops out at about (0.53, 1.34, 0.28).


def build_jasper(L, cushions):
    coll, root = rig("Jasper")
    s = L["slots"]
    j = L["npcs"]["jasper"]
    ahead = j["x"] - (s["x"] + s["d"] / 2)  # the machine's face, ahead of him (he faces -x)
    lever = (s["w"] / 2 + 0.08, 1.3, ahead - 0.12)
    seat = cushions["barStool"]["top"]
    B = Part()
    # the stool: a brass foot, post and foot ring, a round velvet seat
    lathe(B, 0.0, 0.0, [(0, 0), (0.17, 0), (0.16, 0.03), (0, 0.035)], "Brass")
    cylinder(B, (0.0, 0.03, 0.0), (0.0, seat - 0.07, 0.0), 0.028, "Brass", sides=8)
    for k in range(8):
        a0, a1 = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
        cylinder(B, (0.14 * math.cos(a0), 0.2, 0.14 * math.sin(a0)), (0.14 * math.cos(a1), 0.2, 0.14 * math.sin(a1)), 0.012, "Brass", sides=6)
    lathe(B, 0.0, 0.0, [(0, seat - 0.07), (0.19, seat - 0.07), (0.21, seat - 0.035), (0.19, seat), (0, seat)], "Velvet", segs=16)
    # the cat, sitting: haunches on the seat, hind paws forward, an upright body with a white bib
    blob(B, 0.0, seat + 0.11, -0.02, 0.17, 0.12, 0.17, "CatBlack", cuts=4)
    for sx in (-1, 1):
        blob(B, sx * 0.12, seat + 0.08, 0.08, 0.07, 0.07, 0.12, "CatBlack")
        blob(B, sx * 0.12, seat + 0.03, 0.19, 0.05, 0.035, 0.06, "CatWhite", cuts=2)
    blob(B, 0.0, seat + 0.3, 0.0, 0.15, 0.19, 0.13, "CatBlack", cuts=4)
    blob(B, 0.0, seat + 0.3, 0.085, 0.09, 0.16, 0.06, "CatWhite")
    for sx in (-1, 1):
        blob(B, sx * 0.05, seat + 0.45, 0.12, 0.05, 0.03, 0.02, "BowRed", cuts=2)
    blob(B, 0.0, seat + 0.45, 0.135, 0.022, 0.024, 0.016, "BowRed", cuts=2)
    body = node("Jasper_Body", B, coll, root)

    H = Part()
    neck = (0.0, seat + 0.46, 0.0)
    hy = seat + 0.62
    blob(H, 0.0, hy, 0.01, 0.19, 0.16, 0.17, "CatBlack", cuts=4)
    blob(H, 0.0, hy - 0.06, 0.13, 0.095, 0.06, 0.06, "CatWhite")
    blob(H, 0.0, hy - 0.035, 0.19, 0.025, 0.018, 0.015, "CatNose", cuts=1)
    eyes(H, 0.075, hy + 0.02, 0.14, 0.036, 0.04, eye="CatEye", pupil="Eye")
    for sx in (-1, 1):
        cylinder(H, (sx * 0.1, hy + 0.1, -0.01), (sx * 0.155, hy + 0.25, -0.03), 0.065, "CatBlack", sides=6, r_end=0.008)
        cylinder(H, (sx * 0.1, hy + 0.11, 0.01), (sx * 0.145, hy + 0.22, -0.005), 0.035, "EarPink", sides=5, r_end=0.006)
        for dy in (0.0, 0.025):
            cylinder(H, (sx * 0.07, hy - 0.05 + dy, 0.17), (sx * 0.24, hy - 0.04 + dy * 1.5, 0.19), 0.003, "CatWhite", sides=4)
    node("Jasper_Head", H, coll, body, neck)

    # his right paw resting on his knee (he waves with it); his left up on the lever
    A = Part()
    shoulder = (-0.12, seat + 0.38, 0.04)
    arm(A, shoulder, (-0.15, seat + 0.24, 0.1), (-0.12, seat + 0.12, 0.2), "CatBlack", "CatBlack", r=0.042, paw_size=0.045, paw_colour="CatWhite")
    node("Jasper_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.12, seat + 0.38, 0.04)
    arm(A, shoulder, (0.3, seat + 0.55, 0.12), (lever[0] - 0.04, lever[1] - 0.02, lever[2]), "CatBlack", "CatBlack", r=0.042, paw_size=0.045, paw_colour="CatWhite")
    node("Jasper_ArmL", A, coll, body, shoulder)

    # the tail: down off the back of the seat and curling up behind him
    T = Part()
    pts = [(0.0, seat + 0.06, -0.17), (0.0, seat - 0.02, -0.32), (0.05, seat + 0.08, -0.45), (0.1, seat + 0.26, -0.47), (0.12, seat + 0.38, -0.4)]
    for a, b in zip(pts, pts[1:]):
        cylinder(T, a, b, 0.035, "CatBlack", sides=8, r_end=0.03)
        blob(T, b[0], b[1], b[2], 0.035, 0.035, 0.035, "CatBlack", cuts=1)
    node("Jasper_Tail", T, coll, body, pts[0])
    return coll


# ---------------------------------------------------------------------------------------------
# Pippin: the penguin mixologist behind the bar, on its duckboard step. The counter's back edge is
# 0.35 ahead of him, its top 0.42 over his feet.


def build_pippin(L):
    coll, root = rig("Pippin")
    b = L["bar"]
    pip = L["npcs"]["pippin"]
    top = b["top"] - b["floor"]
    edge = (b["x1"] - 0.6) - pip["x"]  # the counter top's back edge, ahead of him (he faces +x)
    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.08, 0.02, 0.08, 0.06, 0.02, 0.08, "Beak", bottom=0.0)
    blob(B, 0.0, 0.42, 0.0, 0.23, 0.36, 0.2, "PenBlack", cuts=4)
    blob(B, 0.0, 0.4, 0.08, 0.17, 0.3, 0.14, "PenWhite", cuts=4)
    for sx in (-1, 1):
        blob(B, sx * 0.055, 0.68, 0.17, 0.05, 0.03, 0.02, "BowBurgundy", cuts=2)
    blob(B, 0.0, 0.68, 0.185, 0.022, 0.024, 0.016, "BowBurgundy", cuts=2)
    # the cocktail he has just poured, on the counter in front of him: a tumbler, a cherry
    gx, gz = -0.08, edge + 0.18
    lathe(B, gx, gz, [(0, 0), (0.045, 0), (0.05, 0.1), (0, 0.1)], "Glass", y0=top)
    lathe(B, gx, gz, [(0, 0), (0.042, 0), (0.042, 0.06), (0, 0.06)], "Drink", y0=top + 0.035)
    blob(B, gx, top + 0.115, gz, 0.02, 0.02, 0.02, "Cherry", cuts=1)
    body = node("Pippin_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.72, 0.0)
    blob(H, 0.0, 0.86, 0.0, 0.18, 0.16, 0.17, "PenBlack", cuts=4)
    blob(H, 0.0, 0.84, 0.1, 0.125, 0.1, 0.08, "PenWhite")
    eyes(H, 0.065, 0.885, 0.155, 0.024, 0.028)
    blob(H, 0.0, 0.83, 0.21, 0.05, 0.028, 0.075, "Beak", cuts=2)
    for sx in (-1, 1):
        blob(H, sx * 0.11, 0.82, 0.15, 0.028, 0.017, 0.012, "Blush", cuts=1)
    node("Pippin_Head", H, coll, body, neck)

    # flippers: the right resting on the counter (he waves with it); the left holding the shaker
    A = Part()
    shoulder = (-0.2, 0.6, 0.02)
    tip = (-0.17, top + 0.03, edge + 0.08)
    cylinder(A, shoulder, tip, 0.065, "PenBlack", sides=8, r_end=0.03)
    blob(A, tip[0], tip[1], tip[2], 0.04, 0.02, 0.06, "PenBlack", cuts=2)
    node("Pippin_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.2, 0.6, 0.02)
    tip = (0.21, 0.66, 0.26)
    cylinder(A, shoulder, tip, 0.065, "PenBlack", sides=8, r_end=0.035)
    lathe(A, tip[0] + 0.02, tip[2] + 0.04, [(0, 0), (0.045, 0), (0.05, 0.16), (0.03, 0.21), (0.016, 0.25), (0, 0.26)], "Chrome", y0=tip[1] - 0.1)
    lathe(A, tip[0] + 0.02, tip[2] + 0.04, [(0, 0.19), (0.036, 0.19), (0.036, 0.22), (0, 0.22)], "Brass", y0=tip[1] - 0.1)
    node("Pippin_ArmL", A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.1, -0.2, 0.08, 0.04, 0.08, "PenBlack", cuts=2)
    node("Pippin_Tail", T, coll, body, (0.0, 0.12, -0.16))
    return coll


# ---------------------------------------------------------------------------------------------
# Bruno: the bulldog bouncer by the VIP doors (the game stands him on the pit, facing +x). He stands
# square, arms folded; he unfolds the right one to wave.


def build_bruno(L):
    coll, root = rig("Bruno")
    B = Part()
    for sx in (-1, 1):
        cylinder(B, (sx * 0.12, 0.36, 0.0), (sx * 0.13, 0.08, 0.02), 0.09, "Suit", r_end=0.08)
        blob(B, sx * 0.13, 0.045, 0.07, 0.09, 0.045, 0.14, "Black", bottom=0.0)
    blob(B, 0.0, 0.57, 0.0, 0.31, 0.3, 0.26, "Suit", cuts=4)
    blob(B, 0.0, 0.37, 0.0, 0.29, 0.1, 0.24, "Suit", top=0.44)
    blob(B, 0.0, 0.68, 0.17, 0.09, 0.12, 0.09, "TuxShirt")  # the shirt in the jacket's V
    cylinder(B, (0.0, 0.76, 0.255), (0.0, 0.56, 0.27), 0.022, "Black", sides=6, r_end=0.035)  # the tie
    for sx in (-1, 1):
        cylinder(B, (sx * 0.08, 0.78, 0.2), (sx * 0.14, 0.52, 0.22), 0.03, "SuitShade", sides=6)  # lapels
    for k, y in enumerate((0.48, 0.4)):
        blob(B, 0.0, y, 0.265 - k * 0.01, 0.016, 0.016, 0.008, "Black", cuts=1)
    blob(B, 0.0, 0.8, 0.1, 0.16, 0.06, 0.14, "FawnWhite")  # the chest ruff at the collar
    body = node("Bruno_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.8, 0.0)
    blob(H, 0.0, 0.99, 0.0, 0.3, 0.19, 0.22, "Fawn", cuts=4, n=2.6)
    blob(H, 0.0, 0.92, 0.15, 0.22, 0.1, 0.1, "FawnWhite", n=2.6)
    for sx in (-1, 1):
        blob(H, sx * 0.14, 0.88, 0.15, 0.11, 0.09, 0.09, "FawnWhite")  # jowls
        blob(H, sx * 0.085, 1.04, 0.2, 0.07, 0.042, 0.02, "Black", cuts=2)  # dark glasses
        blob(H, sx * 0.27, 1.1, -0.02, 0.06, 0.03, 0.07, "FawnDark", cuts=2, tilt=0.4)  # rose ears, folded
        blob(H, sx * 0.3, 1.06, 0.02, 0.03, 0.05, 0.05, "FawnDark", cuts=1)
    cylinder(H, (-0.03, 1.062, 0.218), (0.03, 1.062, 0.218), 0.008, "Brass", sides=5)
    blob(H, 0.0, 0.99, 0.255, 0.055, 0.036, 0.03, "Nose", cuts=2)
    blob(H, 0.0, 0.85, 0.2, 0.1, 0.035, 0.065, "Mouth")  # the underbite
    for sx in (-1, 1):
        blob(H, sx * 0.05, 0.878, 0.25, 0.012, 0.018, 0.01, "Tooth", cuts=1)
    for k in range(3):
        blob(H, 0.0, 1.12 + k * 0.025, 0.17 - k * 0.025, 0.1 - k * 0.015, 0.008, 0.02, "FawnShade", cuts=1)  # his brow
    cylinder(H, (-0.24, 1.02, 0.02), (-0.2, 0.84, -0.07), 0.008, "Coil", sides=5)  # the earpiece
    node("Bruno_Head", H, coll, body, neck)

    for sx, name in ((-1, "Bruno_ArmR"), (1, "Bruno_ArmL")):
        A = Part()
        shoulder = (sx * 0.3, 0.72, 0.02)
        elbow = (sx * 0.31, 0.52, 0.2)
        paw = (-sx * 0.15, 0.6 + (0.03 if sx > 0 else 0.0), 0.29 + (0.04 if sx > 0 else 0.0))
        arm(A, shoulder, elbow, paw, "Suit", "Suit", r=0.08, paw_size=0.065, paw_colour="Fawn")
        blob(A, lerp(elbow, paw, 0.82)[0], lerp(elbow, paw, 0.82)[1], lerp(elbow, paw, 0.82)[2], 0.06, 0.06, 0.06, "TuxShirt", cuts=1)  # a cuff
        node(name, A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.34, -0.27, 0.06, 0.05, 0.05, "Fawn")
    node("Bruno_Tail", T, coll, body, (0.0, 0.34, -0.23))
    return coll


# ---------------------------------------------------------------------------------------------
# the crowd: three archetypes, two nodes each (the animal; the clothes to tint)


def build_patrons():
    purge("Patrons")
    coll = bpy.data.collections.new("Patrons")
    bpy.context.scene.collection.children.link(coll)

    # an evening-gowned rabbit: a floor-length gown, opera gloves, a clutch; pearls, tall ears
    F, O = Part(), Part()
    lathe(O, 0.0, 0.0, [(0, 0), (0.25, 0), (0.23, 0.08), (0.17, 0.35), (0.13, 0.52), (0, 0.52)], "PatCloth", segs=16)
    blob(O, 0.0, 0.64, 0.0, 0.14, 0.15, 0.12, "PatCloth", cuts=3)
    blob(O, 0.0, 0.53, 0.0, 0.145, 0.03, 0.125, "PatClothShade", cuts=2)  # the sash
    blob(F, 0.0, 0.79, 0.0, 0.11, 0.06, 0.09, "PatFurWhite", cuts=2)  # bare shoulders
    for sx in (-1, 1):
        cylinder(F, (sx * 0.13, 0.76, 0.0), (sx * 0.17, 0.62, 0.03), 0.035, "PatFurWhite", sides=6)
        cylinder(O, (sx * 0.17, 0.62, 0.03), (sx * 0.13, 0.48, 0.08), 0.033, "PatClothLight", sides=6)  # gloves
        blob(O, sx * 0.13, 0.46, 0.09, 0.035, 0.03, 0.035, "PatClothLight", cuts=1)
    box(O, 0.09, 0.19, 0.44, 0.5, 0.08, 0.13, "PatClothShade")  # the clutch
    for k in range(9):
        a = math.radians(-80 + 20 * k)
        blob(F, 0.09 * math.sin(a), 0.8 - 0.02 * math.cos(a) ** 2, 0.02 + 0.08 * math.cos(a), 0.012, 0.012, 0.012, "Pearl", cuts=1)
    blob(F, 0.0, 0.96, 0.01, 0.15, 0.14, 0.14, "PatFurWhite", cuts=3)
    blob(F, 0.0, 0.92, 0.11, 0.07, 0.05, 0.05, "PatFurWhite", cuts=2)
    blob(F, 0.0, 0.94, 0.16, 0.02, 0.014, 0.012, "PatPink", cuts=1)
    eyes(F, 0.055, 0.99, 0.12, 0.018, 0.024)
    for sx in (-1, 1):
        blob(F, sx * 0.06, 1.2, -0.01, 0.045, 0.16, 0.035, "PatFurWhite", cuts=2)
        blob(F, sx * 0.06, 1.2, 0.015, 0.025, 0.12, 0.012, "PatPink", cuts=1)
    blob(F, 0.0, 0.28, -0.22, 0.06, 0.06, 0.06, "PatFurWhite", cuts=1)  # the tail peeks out of the gown
    node("Patron_Rabbit_Fur", F, coll)
    node("Patron_Rabbit_Outfit", O, coll)

    # a raccoon in a tailored suit: the mask, the ringed tail, a white collar
    F, O = Part(), Part()
    for sx in (-1, 1):
        cylinder(O, (sx * 0.08, 0.4, 0.0), (sx * 0.085, 0.06, 0.01), 0.055, "PatCloth", r_end=0.05)
        blob(F, sx * 0.085, 0.035, 0.05, 0.06, 0.035, 0.09, "PatFurDark", bottom=0.0, cuts=1)
    blob(O, 0.0, 0.58, 0.0, 0.18, 0.22, 0.15, "PatCloth", cuts=3)  # the jacket
    blob(O, 0.0, 0.4, 0.0, 0.17, 0.07, 0.14, "PatClothShade", cuts=2)
    blob(F, 0.0, 0.66, 0.12, 0.06, 0.1, 0.05, "PatFurWhite", cuts=1)  # the shirt front
    cylinder(O, (0.0, 0.75, 0.165), (0.0, 0.56, 0.17), 0.016, "PatClothShade", sides=5, r_end=0.025)  # the tie
    for sx in (-1, 1):
        cylinder(O, (sx * 0.18, 0.72, 0.0), (sx * 0.2, 0.5, 0.05), 0.05, "PatCloth", sides=7)
        blob(F, sx * 0.2, 0.47, 0.06, 0.04, 0.035, 0.04, "PatFurDark", cuts=1)
    blob(F, 0.0, 0.93, 0.0, 0.16, 0.14, 0.14, "PatFurGrey", cuts=3)
    blob(F, 0.0, 0.94, 0.11, 0.13, 0.04, 0.05, "PatFurDark", cuts=2)  # the mask
    blob(F, 0.0, 0.87, 0.12, 0.07, 0.045, 0.06, "PatFurWhite", cuts=2)
    blob(F, 0.0, 0.88, 0.18, 0.02, 0.015, 0.012, "Nose", cuts=1)
    eyes(F, 0.055, 0.95, 0.155, 0.016, 0.02)
    for sx in (-1, 1):
        blob(F, sx * 0.11, 1.07, -0.01, 0.045, 0.05, 0.03, "PatFurGrey", cuts=1)
        blob(F, sx * 0.11, 1.07, 0.01, 0.025, 0.03, 0.01, "PatFurWhite", cuts=1)
    pts = [(0.0, 0.3, -0.12), (0.05, 0.22, -0.26), (0.12, 0.2, -0.38), (0.18, 0.26, -0.47)]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        cylinder(F, a, b, 0.06, "PatFurDark" if k % 2 else "PatFurGrey", sides=8, r_end=0.055)
        blob(F, b[0], b[1], b[2], 0.058, 0.058, 0.058, "PatFurGrey" if k % 2 else "PatFurDark", cuts=1)
    node("Patron_Raccoon_Fur", F, coll)
    node("Patron_Raccoon_Outfit", O, coll)

    # a dapper badger: a waistcoat, a bowler, a bow tie and a watch chain
    F, O = Part(), Part()
    for sx in (-1, 1):
        cylinder(O, (sx * 0.09, 0.38, 0.0), (sx * 0.095, 0.06, 0.01), 0.06, "PatClothShade", r_end=0.055)
        blob(F, sx * 0.095, 0.035, 0.05, 0.065, 0.035, 0.09, "PatFurDark", bottom=0.0, cuts=1)
    blob(F, 0.0, 0.55, 0.0, 0.185, 0.22, 0.155, "PatFurGrey", cuts=3)
    blob(O, 0.0, 0.53, 0.005, 0.205, 0.2, 0.175, "PatCloth", cuts=3, top=0.68, bottom=0.36)  # the waistcoat
    blob(F, 0.0, 0.66, 0.13, 0.07, 0.08, 0.05, "PatFurWhite", cuts=1)  # the shirt
    for sx in (-1, 1):
        blob(F, sx * 0.045, 0.72, 0.17, 0.04, 0.025, 0.02, "BowRed", cuts=1)
    blob(F, 0.0, 0.72, 0.185, 0.018, 0.02, 0.014, "BowRed", cuts=1)
    cylinder(F, (-0.06, 0.52, 0.18), (0.07, 0.48, 0.18), 0.006, "Brass", sides=4)  # the watch chain
    for k in range(3):
        blob(O, 0.0, 0.6 - k * 0.07, 0.185, 0.012, 0.012, 0.008, "PatClothShade", cuts=1)
    for sx in (-1, 1):
        cylinder(F, (sx * 0.2, 0.68, 0.0), (sx * 0.22, 0.47, 0.05), 0.05, "PatFurGrey", sides=7)
        blob(F, sx * 0.22, 0.44, 0.06, 0.04, 0.035, 0.04, "PatFurDark", cuts=1)
    blob(F, 0.0, 0.9, 0.0, 0.16, 0.14, 0.15, "PatFurWhite", cuts=3)
    for sx in (-1, 1):
        blob(F, sx * 0.07, 0.95, 0.06, 0.04, 0.12, 0.1, "PatFurDark", cuts=2)  # the black stripes
        blob(F, sx * 0.12, 1.02, -0.03, 0.035, 0.03, 0.025, "PatFurDark", cuts=1)
    blob(F, 0.0, 0.85, 0.15, 0.022, 0.016, 0.012, "Nose", cuts=1)
    eyes(F, 0.07, 0.93, 0.13, 0.014, 0.018, glint=False)
    lathe(O, 0.0, 0.0, [(0, 1.0), (0.155, 1.0), (0.16, 1.015), (0.115, 1.03), (0.115, 1.1), (0.095, 1.15), (0.05, 1.175), (0, 1.18)], "PatClothShade", segs=16)  # the bowler
    lathe(O, 0.0, 0.0, [(0, 1.03), (0.118, 1.03), (0.118, 1.05), (0, 1.05)], "PatClothLight", segs=16)
    blob(F, 0.0, 0.3, -0.2, 0.05, 0.04, 0.05, "PatFurGrey", cuts=1)
    node("Patron_Badger_Fur", F, coll)
    node("Patron_Badger_Outfit", O, coll)
    return coll


# ---------------------------------------------------------------------------------------------


def read_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    m = re.search(r"\bbarStool: \{ y: (-?[0-9.]+), h: ([0-9.]+) \}", src)
    y, h = float(m.group(1)), float(m.group(2))
    return {"barStool": {"top": y + h / 2}}


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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": len(o.data.materials)}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        L = read_layout(root)
        cushions = read_cushions(root)
        result = {"ok": True}
        only = globals().get("ONLY")
        for name, make in (("boris", lambda: build_boris(L)), ("vivienne", lambda: build_vivienne(L)), ("jasper", lambda: build_jasper(L, cushions)), ("pippin", lambda: build_pippin(L)), ("bruno", lambda: build_bruno(L)), ("patrons", build_patrons)):
            if only and name not in only:
                continue
            coll = make()
            bpy.context.view_layer.update()
            out = os.path.join(root, "client", "public", "models", f"{name}.glb")
            export(coll, out)
            result[name] = {"bytes": os.path.getsize(out), **summary(coll)}
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
