"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b --factory-startup -P scripts/blender/build_caverns.py

Nothing is placed by hand: where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is). A 28 x 28 underground
amphitheatre in two tiers, stylised clay like the other worlds, every colour a vertex colour and the
light painted in (the forge's, the lanterns', the onsen's, the Grotto Pool's and every crystal's and
mushroom's glow baked into the rock round them: only three lights move in the game). One mesh per
finish, so the whole static diorama is six draw calls:

    Cave_Rock       CV_Clay       the floors (the terrace's dry shale, the basin's cold stone, the
                                  sanctuary's flagstones), the terrace's block and its wet cliff, the
                                  stair and its parapets, the rims, Gus's workshop and counter, the
                                  forge's stonework, the anvil, the rails, the onsen's rim and ledge,
                                  the pool's bowl and pier, the rocks
    Cave_Shell      CV_Shell      the cavern's north and west walls, double sided (no void past them)
    Cave_Glow       CV_Glow       what glows (the game lights it from its own vertex colours): the
                                  crystals, the mushrooms' caps, the lanterns, the forge's mouth, the
                                  sanctuary's runes, the pool's glowing moss, the gems on Gus's shelves
    Cave_Water      CV_Water      the Grotto Pool's surface (transparent in the game, no depth write),
                                  0.15 m and more over every bed it covers, its edge under the rim stones
    Cave_Onsen      CV_OnsenWater the onsen's water (the same)
    Cave_Overhang   CV_Occluder   the rock overhang over the pool, its pillar and stalactites, and the
                                  timber shoring's beams (the game dithers them away where they stand
                                  between you and the camera)

and the ore nodes' rocks, each at the origin (its pivot at the foot of the rock, on its floor), for the
game to place at every node of its kind, instanced:

    Ore_<kind>      CV_OreRock + CV_OreGlow   coal, copper, iron, silver, glimmer, monolith
    Ore_Rubble      CV_OreRock                what a broken node leaves till it grows back

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import random
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Caverns"

# finishes: roughness, and whether a face is seen from behind too
FINISHES = {"CV_Clay": 0.86, "CV_Shell": 0.9, "CV_Glow": 0.6, "CV_Water": 0.2, "CV_OnsenWater": 0.25, "CV_Occluder": 0.86, "CV_OreRock": 0.8, "CV_OreGlow": 0.55}
DOUBLE_SIDED = {"CV_Shell", "CV_Water", "CV_OnsenWater"}

C = {
    # the terrace: dry shale in warm lantern light
    "shale": "#8A7B6A",
    "shaleDark": "#6E6254",
    "shaleLight": "#A3927C",
    "terraceWall": "#6A5F58",
    # the basin: cold stone, bioluminescent
    "stone": "#3D4556",
    "stoneDark": "#2C3240",
    "stoneLight": "#57627A",
    "chasm": "#2E3448",
    "fungal": "#3E3552",
    "moss": "#2F5A5A",
    "mossGlow": "#3FB8A8",
    "flag": "#6B6F7D",
    "flagDark": "#545866",
    "cliff": "#4A4F5C",
    "wet": "#2F3440",
    "shell": "#4B4654",
    "shellCold": "#343B4E",
    "bedrock": "#241F26",
    "rim": "#3A3544",
    # wood, metal, cloth
    "timber": "#7A5536",
    "timberDark": "#5A3D27",
    "plank": "#9C7148",
    "plankOld": "#7D6A55",
    "iron": "#3A3836",
    "steel": "#8E949C",
    "brass": "#C9973E",
    "leather": "#6B4228",
    "cloth": "#C9B79A",
    "sack": "#B59B72",
    "coal": "#1E1C20",
    "tunnel": "#0D0C11",
    "stoneRim": "#7C7A80",
    "onsenStone": "#8C8A86",
    "towel": "#E9DDC4",
    "redCloth": "#B3403A",
    # glows
    "lantern": "#FFB347",
    "lanternHot": "#FFD58A",
    "forgeMouth": "#FF7A2F",
    "forgeCore": "#FFD27A",
    "cyan": "#00F0FF",
    "violet": "#9D00FF",
    "cyanSoft": "#6FF6FF",
    "violetSoft": "#C58BFF",
    "rune": "#B36BFF",
    "shroomTeal": "#4FFFD2",
    "shroomPink": "#FF7AD9",
    "algae": "#27D8C9",
    "gemRed": "#FF5A6E",
    "gemGreen": "#5AFF9A",
    # water
    "water": "#1B6C85",
    "onsenWater": "#8FD3D0",
    # ores
    "coalRock": "#3B3632",
    "coalChunk": "#16151A",
    "ember": "#FF8A3A",
    "copperRock": "#6B4A3A",
    "copperNug": "#D9803F",
    "copperGlow": "#FFB070",
    "ironRock": "#55585F",
    "rust": "#8A4B2A",
    "ironNug": "#A0A6B0",
    "ironGlow": "#FF8A4A",
    "silverRock": "#7D8594",
    "silverVein": "#DFF6FF",
    "glimmerBase": "#2A2D3A",
    "monolith": "#2B2433",
    "monolithEdge": "#3C3348",
    "runeGlow": "#B36BFF",
    "rubble": "#5A5560",
}


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    """A colour (a hex, or a name from C) in linear rgb."""
    h = (hex_color if hex_color.startswith("#") else C[hex_color]).lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def W(x, y, z):
    """The game's (x, y up, z) as a Blender point."""
    return Vector((x, -z, y))


def G(v):
    """A Blender point as the game's (x, y, z)."""
    return (v.x, v.z, -v.y)


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_caverns.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "caverns.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


def read_ore_radii(root):
    """Each node kind's rock radius (shared/caverns_mining.ts ORE_KINDS): the rocks are that big."""
    src = open(os.path.join(root, "shared", "caverns_mining.ts"), encoding="utf-8").read()
    out = {}
    for kind in ("coal", "copper", "iron", "silver", "glimmer", "monolith"):
        m = re.search(rf"\b{kind}: \{{ name: \"[^\"]+\", emoji: \"[^\"]+\", tier: \d, hp: \d+, respawnS: \[[^\]]+\], radius: ([0-9.]+)", src)
        out[kind] = float(m.group(1))
    return out


def read_onsen_ledge(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    m = re.search(r"\bonsenLedge: \{ y: (-?[0-9.]+), h: ([0-9.]+) \}", src)
    return float(m.group(1)) + float(m.group(2)) / 2


# ---------------------------------------------------------------------------------------------
# noise


def hash3(ix, iy, iz, seed=0):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, z, seed=0):
    """Smooth value noise in -1..1."""
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    acc = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (ux if dx else 1 - ux) * (uy if dy else 1 - uy) * (uz if dz else 1 - uz)
                acc += w * hash3(ix + dx, iy + dy, iz + dz, seed)
    return acc * 2 - 1


def fbm(x, y, z, seed=0, octaves=3):
    a, f, s = 0.5, 1.0, 0.0
    for k in range(octaves):
        s += a * vnoise(x * f, y * f, z * f, seed + k * 17)
        a *= 0.5
        f *= 2.03
    return s


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------------
# a mesh in the making: faces with a colour each (linear rgb), painted into its "Col" corner colours


class Mesh:
    """Faces with a colour each (a palette index in the face layer "ci"); a vertex may carry its own
    colour (the vert layer "vc", index + 1: the grids and the lumps, shared by every face round it,
    so it is exported once, not once a face) and a face be smooth shaded ("sm"). (BMesh layers, not
    dicts: an element's Python wrapper is no key to rely on.)"""

    def __init__(self, finish):
        self.finish = finish
        self.bm = bmesh.new()
        self.colors = []
        self._index = {}
        self.fl = self.bm.faces.layers.int.new("ci")
        self.fs = self.bm.faces.layers.int.new("sm")
        self.vl = self.bm.verts.layers.int.new("vc")

    def ci(self, col):
        rgb = lin(col) if isinstance(col, str) else tuple(col)
        key = tuple(round(c, 5) for c in rgb)
        if key not in self._index:
            self._index[key] = len(self.colors)
            self.colors.append(rgb)
        return self._index[key]

    def face(self, verts, col):
        f = self.bm.faces.new(verts)
        f[self.fl] = self.ci(col)
        return f

    def setf(self, f, col):
        f[self.fl] = self.ci(col)

    def setv(self, v, col):
        v[self.vl] = self.ci(col) + 1

    def setsmooth(self, f):
        f[self.fs] = 1
        return f

    def v(self, x, y, z):
        return self.bm.verts.new(W(x, y, z))


def quad_grid(M, x0, x1, z0, z1, cell, height, colour, keep=None, flip=False):
    """A floor over [x0, x1] x [z0, z1]: a grid of `cell` cells at `height(x, z)`, coloured
    `colour(x, z)` (a hex, or linear rgb), the cells `keep(x, z)` refuses left out."""
    nx = max(1, int(round((x1 - x0) / cell)))
    nz = max(1, int(round((z1 - z0) / cell)))
    verts = {}

    def vert(i, k):
        if (i, k) not in verts:
            x = x0 + (x1 - x0) * i / nx
            z = z0 + (z1 - z0) * k / nz
            v = M.v(x, height(x, z), z)
            M.setv(v, colour(x, z))
            verts[(i, k)] = v
        return verts[(i, k)]

    for i in range(nx):
        for k in range(nz):
            cx = x0 + (x1 - x0) * (i + 0.5) / nx
            cz = z0 + (z1 - z0) * (k + 0.5) / nz
            if keep and not keep(cx, cz):
                continue
            quad = [vert(i, k), vert(i, k + 1), vert(i + 1, k + 1), vert(i + 1, k)]
            M.setsmooth(M.face(list(reversed(quad)) if flip else quad, colour(cx, cz)))


def slab(M, outline, y0, y1, col, top=None, bottom=True):
    # (wound so every face looks outward: the outline taken clockwise seen from above)
    area = sum(outline[i][0] * outline[(i + 1) % len(outline)][1] - outline[(i + 1) % len(outline)][0] * outline[i][1] for i in range(len(outline)))
    if area > 0:
        outline = list(reversed(outline))
    lo = [M.v(x, y0, z) for x, z in outline]
    hi = [M.v(x, y1, z) for x, z in outline]
    M.face(hi, top or col)
    if bottom:
        M.face(list(reversed(lo)), col)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        M.face((lo[i], lo[j], hi[j], hi[i]), col)


def box(M, x0, x1, y0, y1, z0, z1, col, top=None, bottom=True):
    slab(M, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, col, top, bottom)


def cyl(M, a, b, r, col, sides=10, r_end=None, cap=True):
    """A round bar between the game points a and b."""
    A, B = W(*a), W(*b)
    axis = (B - A).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    re_ = r if r_end is None else r_end
    ra = [M.bm.verts.new(A + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    rb = [M.bm.verts.new(B + (n * math.cos(t) + q * math.sin(t)) * re_) for t in (2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        k1 = (k + 1) % sides
        M.face((ra[k], ra[k1], rb[k1], rb[k]), col)
    if cap:
        M.face(list(reversed(ra)), col)
        if re_ > 1e-4:
            M.face(rb, col)


def cone(M, base, tip, r, col, sides=8):
    A, B = W(*base), W(*tip)
    axis = (B - A).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    ring = [M.bm.verts.new(A + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    apex = M.bm.verts.new(B)
    for k in range(sides):
        M.face((ring[k], ring[(k + 1) % sides], apex), col)
    M.face(list(reversed(ring)), col)


def blob(M, cx, cy, cz, hx, hy, hz, col, cuts=3, n=2.2, noise=0.0, seed=0, bottom=None, top=None):
    """A rounded lump (a superellipsoid, roughened by `noise`), centred on the game point."""
    bm = M.bm
    # (the verts already there tagged: the new cube's are the untagged ones; a BMesh element's
    # Python wrapper is not a stable key, so no sets of them)
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        gx, gy, gz = q.x, q.z, -q.y
        amp = 1 + noise * fbm(gx * 1.7 + seed, gy * 1.7, gz * 1.7, seed)
        y = cy + gy * hy * amp
        if bottom is not None:
            y = max(y, bottom)
        if top is not None:
            y = min(y, top)
        v.co = W(cx + gx * hx * amp, y, cz + gz * hz * amp)
    # (smooth: an organic lump shares its vertices, one colour all over)
    for v in new:
        M.setv(v, col)
    for f in {f for v in new for f in v.link_faces}:
        M.setf(f, col)
        M.setsmooth(f)
    for v in bm.verts:
        v.tag = False


def prism(M, base, direction, r, length, col, sides=6, tip=0.35):
    """A crystal: a hexagonal prism from `base` along `direction`, pointed at its end."""
    d = Vector(direction).normalized()
    top = (base[0] + d.x * length, base[1] + d.y * length, base[2] + d.z * length)
    shaft = (base[0] + d.x * length * (1 - tip), base[1] + d.y * length * (1 - tip), base[2] + d.z * length * (1 - tip))
    cyl(M, base, shaft, r, col, sides=sides, cap=False)
    A = W(*shaft)
    axis = (W(*top) - A).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    ring = [M.bm.verts.new(A + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    apex = M.bm.verts.new(W(*top))
    for k in range(sides):
        M.face((ring[k], ring[(k + 1) % sides], apex), col)
    base_ring = [M.bm.verts.new(W(*base) + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    M.face(list(reversed(base_ring)), col)


def lathe(M, cx, cz, profile, col, segs=12, y0=0.0):
    bottom = M.v(cx, y0 + profile[0][1], cz)
    top = M.v(cx, y0 + profile[-1][1], cz)
    rings = [[M.v(cx + r * math.cos(2 * math.pi * k / segs), y0 + h, cz + r * math.sin(2 * math.pi * k / segs)) for k in range(segs)] for r, h in profile[1:-1]]
    for k in range(segs):
        k1 = (k + 1) % segs
        M.face((bottom, rings[0][k], rings[0][k1]), col)
        M.face((top, rings[-1][k1], rings[-1][k]), col)
        for r0, r1 in zip(rings, rings[1:]):
            M.face((r0[k], r1[k], r1[k1], r0[k1]), col)


def ellipse(cx, cz, rx, rz, n=40, wob=0.0, seed=0):
    return [(cx + rx * (1 + wob * vnoise(math.cos(a) * 2, math.sin(a) * 2, 0.3, seed)) * math.cos(a), cz + rz * (1 + wob * vnoise(math.cos(a) * 2, math.sin(a) * 2, 0.7, seed)) * math.sin(a)) for a in (2 * math.pi * k / n for k in range(n))]


# ---------------------------------------------------------------------------------------------
# the light, painted in: warm lanterns and the forge on the terrace, the cold glow below


LIGHTS = []  # (x, y, z, rgb, strength, radius)


def add_light(x, y, z, col, strength, radius):
    LIGHTS.append((x, y, z, lin(col), strength, radius))


def lit(rgb, p, nrm, ambient):
    """A colour under the baked lights: `ambient` of it as it is, and each light's share by its
    distance and how squarely it falls on the face."""
    r, g, b = rgb[0] * ambient[0], rgb[1] * ambient[1], rgb[2] * ambient[2]
    for lx, ly, lz, lc, st, rad in LIGHTS:
        dx, dy, dz = lx - p[0], ly - p[1], lz - p[2]
        d = math.sqrt(dx * dx + dy * dy + dz * dz)
        if d >= rad:
            continue
        fall = (1 - d / rad) ** 2
        facing = max(0.3, (dx * nrm[0] + dy * nrm[1] + dz * nrm[2]) / (d or 1)) if nrm else 1.0
        k = st * fall * facing
        # the light tints the surface, and lifts it a little on its own (so a dark rock still glows)
        r += (rgb[0] * 1.6 + 0.08) * lc[0] * k
        g += (rgb[1] * 1.6 + 0.08) * lc[1] * k
        b += (rgb[2] * 1.6 + 0.08) * lc[2] * k
    return (min(1.4, r), min(1.4, g), min(1.4, b))


def ambient_at(p):
    """The cavern's own dim light: warmer up the terrace, cooler in the basin, darker up the walls."""
    y = p[1]
    up = smooth(1.5, 3.2, y)
    warm = (0.62, 0.56, 0.5)
    cold = (0.42, 0.47, 0.6)
    a = tuple(cold[i] + (warm[i] - cold[i]) * up for i in range(3))
    fade = 1 - 0.45 * smooth(5.0, 10.0, y)
    return tuple(c * fade for c in a)


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


def material(name):
    """A finish: its colour from the faces' vertex colours (the glows emit it too)."""
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
    rough = FINISHES[name]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if name in ("CV_Glow", "CV_OreGlow"):
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (1.0, 1.0, 1.0, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.8
    if name in ("CV_Water", "CV_OnsenWater"):
        bsdf.inputs["Alpha"].default_value = 0.72 if name == "CV_Water" else 0.62
        try:
            m.blend_method = "BLEND"
        except Exception:
            pass
    m.roughness = rough
    m.use_backface_culling = name not in DOUBLE_SIDED
    return m


def finish_object(name, M, coll, bake=True, mottle=0.0, origin=None, recalc=False):
    """The mesh as an object: every face painted its colour (mottled a little, the light baked in)."""
    bm = M.bm
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    col = bm.loops.layers.float_color.new("Col")
    bm.normal_update()
    for f in bm.faces:
        face_base = M.colors[f[M.fl]] if M.colors else (0.5, 0.5, 0.5)
        smooth_face = f[M.fs] == 1
        for loop in f.loops:
            v = loop.vert
            base = M.colors[v[M.vl] - 1] if smooth_face and v[M.vl] > 0 else face_base
            n = v.normal if smooth_face else f.normal
            nrm = (n.x, n.z, -n.y)
            p = G(v.co)
            if origin is not None:
                p = (p[0] + origin[0], p[1] + origin[1], p[2] + origin[2])
            c = base
            if mottle:
                k = 1 + mottle * fbm(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 5)
                c = (c[0] * k, c[1] * k, c[2] * k)
            if bake:
                c = lit(c, p, nrm, ambient_at(p))
            loop[col] = (c[0], c[1], c[2], 1.0)
    for f in bm.faces:
        f.material_index = 0
        f.smooth = f[M.fs] == 1
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(M.finish))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------------------------------------
# the cavern


def build_cavern(L, coll, ledge_top):
    half = L["half"]
    T = L["terrace"]
    ty, edge = T["y"], T["edge"]
    S = L["stairs"]
    P = L["pool"]
    O = L["onsen"]
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    over = Mesh("CV_Occluder")
    rng = random.Random(7)

    # --- the lights painted in ---
    lt = L["lights"]
    add_light(*lt["forge"], "#FF8A3A", 2.6, 8.0)
    add_light(*lt["onsen"], "#FFC36B", 1.4, 6.0)
    add_light(*lt["pool"], "#00F0FF", 1.8, 7.5)
    add_light(-11.4, ty + 2.4, -12.9, "#FFB347", 1.6, 4.5)  # the adit's lantern
    add_light(-8.0, ty + 1.9, -9.0, "#FFB347", 1.4, 4.5)  # Gus's counter lantern
    for x in (-10.5, -6.0, 4.5, 11.5):  # the lanterns along the terrace's rail
        add_light(x, ty + 1.3, edge - 0.3, "#FFB347", 1.1, 4.2)
    add_light(0.0, 3.6, 0.6, "#FFB347", 1.2, 4.2)  # the shoring's lantern at the stair's foot
    add_light(L["dais"]["x"], 1.4, L["dais"]["z"], "#B36BFF", 1.5, 5.0)
    for x, z, s in L["crystals"]:
        add_light(x, 0.6 * s + (ty if z < edge else 0), z, "#00F0FF" if (int(x * 7 + z * 3) % 3) else "#9D00FF", 0.9 * s, 2.6 * s + 0.6)
    for x, z, s in L["shrooms"]:
        add_light(x, 0.45 * s, z, "#4FFFD2" if (int(x * 5 + z) % 2) else "#FF7AD9", 0.7 * s, 2.2 * s + 0.5)
    for sx, sz, ln in L["overhang"]["stalactites"]:
        add_light(sx, 4.3 - ln, sz, "#6FF6FF", 0.35, 1.8)

    # --- the basin's floor: cold stone, the chasm's darker blue, the fungal chasm's violet moss, the
    # sanctuary's flagstones round the dais; the Grotto Pool's bowl left open ---
    def basin_col(x, z):
        base = lin(C["stone"])
        chasm = lin(C["chasm"])
        fungal = lin(C["fungal"])
        wx = x + 0.8 * math.sin(z * 0.5)
        k1 = smooth(-2.5, -6.0, wx) * smooth(-2.0, 1.0, z)
        k2 = smooth(2.5, 6.0, wx) * smooth(-2.0, 1.0, z)
        c = [base[i] + (chasm[i] - base[i]) * k1 + (fungal[i] - base[i]) * k2 for i in range(3)]
        d = math.hypot(x - L["dais"]["x"], z - L["dais"]["z"])
        if d < L["dais"]["r"] + 0.8:
            f = lin(C["flag"]) if (int(math.floor(x / 0.7)) + int(math.floor(z / 0.7))) % 2 == 0 else lin(C["flagDark"])
            k = smooth(L["dais"]["r"] + 0.8, L["dais"]["r"] - 0.2, d)
            c = [c[i] + (f[i] - c[i]) * k for i in range(3)]
        # the cliff's foot is wet, and moss creeps along it
        wet = smooth(-2.6, -4.0, z)
        c = [c[i] * (1 - 0.3 * wet) + lin(C["moss"])[i] * 0.3 * wet for i in range(3)]
        return tuple(c)

    def in_pool(x, z, pad=0.0):
        return ((x - P["x"]) / (P["rx"] + pad)) ** 2 + ((z - P["z"]) / (P["rz"] + pad)) ** 2 < 1

    def floor_y(x, z):
        return 0.006 + 0.005 * fbm(x * 1.3, 0, z * 1.3, 3)

    quad_grid(rock, -half, half, edge, half, 0.5, floor_y, basin_col, keep=lambda x, z: not in_pool(x, z, 0.05))

    # --- the terrace's floor: dry shale in the lanterns' warmth; the onsen's pool sunk into it ---
    def terrace_col(x, z):
        c = lin(C["shale"])
        k = 0.5 + 0.5 * vnoise(x * 0.6, 0.0, z * 0.6, 9)
        dark = lin(C["shaleDark"])
        c = [c[i] + (dark[i] - c[i]) * k * 0.6 for i in range(3)]
        # Gus's workshop: a plank floor
        W_ = L["workshop"]
        if W_["x0"] - 0.1 < x < W_["x1"] + 0.1 and z < W_["z1"] + 0.95:
            c = list(lin(C["plank"] if int((x - W_["x0"]) / 0.3) % 2 else C["plankOld"]))
        return tuple(c)

    def in_onsen(x, z):
        return O["x"] - O["w"] / 2 < x < O["x"] + O["w"] / 2 and O["z"] - O["d"] / 2 < z < O["z"] + O["d"] / 2

    quad_grid(rock, -half, half, -half, edge, 0.5, lambda x, z: ty + 0.006 + 0.005 * fbm(x * 1.5, 0, z * 1.5, 4), terrace_col, keep=lambda x, z: not in_onsen(x, z))

    # --- the slab under it all, the terrace's block, and the cliff's wet face down to the basin ---
    box(rock, -half, half, -1.4, -0.12, -half, half, "bedrock", top="bedrock")
    # the terrace block: its east end and its front (the cliff) are seen; displaced rock
    cliff_rows = []
    nx = 70
    ny = 10
    for i in range(nx + 1):
        x = -half + 2 * half * i / nx
        col_ = []
        for j in range(ny + 1):
            y = ty * j / ny
            bulge = 0.0 if (S["x0"] - 0.05 <= x <= S["x1"] + 0.05) else 0.16 + 0.1 * fbm(x * 0.8, y * 0.8, 1.0, 11)
            top_in = smooth(ty - 0.35, ty, y)
            v = rock.v(x, y, edge + bulge * (1 - top_in))
            streak = 0.5 + 0.5 * math.sin(x * 5.3 + fbm(x, y, 0, 2) * 3)
            c = lin(C["cliff"])
            wet = lin(C["wet"])
            k = 0.55 * streak * smooth(0.2, 2.5, ty - y + 0.4)
            colr = tuple(c[m] + (wet[m] - c[m]) * k for m in range(3))
            if fbm(x * 1.2, y * 1.2, 7, 6) > 0.25:
                colr = tuple(colr[m] * 0.6 + lin(C["moss"])[m] * 0.4 for m in range(3))
            rock.setv(v, colr)
            col_.append(v)
        cliff_rows.append(col_)
    for i in range(nx):
        x = -half + 2 * half * (i + 0.5) / nx
        if S["x0"] < x < S["x1"]:
            continue
        for j in range(ny):
            y = ty * (j + 0.5) / ny
            streak = 0.5 + 0.5 * math.sin(x * 5.3 + fbm(x, y, 0, 2) * 3)
            c = lin(C["cliff"])
            wet = lin(C["wet"])
            k = 0.55 * streak * smooth(0.2, 2.5, ty - y + 0.4)
            colr = tuple(c[m] + (wet[m] - c[m]) * k for m in range(3))
            if fbm(x * 1.2, y * 1.2, 7, 6) > 0.25:
                colr = tuple(colr[m] * 0.6 + lin(C["moss"])[m] * 0.4 for m in range(3))
            rock.setsmooth(rock.face((cliff_rows[i][j], cliff_rows[i + 1][j], cliff_rows[i + 1][j + 1], cliff_rows[i][j + 1]), colr))
    # the terrace's east end and its underside cut (seen from the camera's side)
    box(rock, half - 0.001, half, 0.0, ty, -half, edge, "terraceWall", bottom=False)
    # the rims: a bumpy lip along the south and east edges, low over the basin
    for k in range(64):
        t = k / 63
        x, z = -half + 2 * half * t, half - 0.18
        blob(rock, x, 0.1, z + 0.05, 0.42 + 0.18 * rng.random(), 0.22 + 0.25 * rng.random(), 0.3, "rim", cuts=2, noise=0.25, seed=k, bottom=-0.2)
    for k in range(44):
        t = k / 43
        z = edge + (half - edge) * t
        blob(rock, half - 0.18, 0.1, z, 0.3, 0.22 + 0.25 * rng.random(), 0.42 + 0.18 * rng.random(), "rim", cuts=2, noise=0.25, seed=100 + k, bottom=-0.2)
    for k in range(26):
        t = k / 25
        z = -half + (edge + half) * t
        blob(rock, half - 0.18, ty + 0.1, z, 0.28, 0.18 + 0.2 * rng.random(), 0.42, "shaleDark", cuts=2, noise=0.25, seed=200 + k, bottom=ty - 0.1)
    # bigger rocks at the front corners, a frame for the diorama
    blob(rock, half - 0.4, 0.6, half - 0.4, 0.9, 1.1, 0.9, "rim", cuts=3, noise=0.3, seed=3, bottom=-0.2)
    blob(rock, half - 0.4, ty + 0.5, -half + 0.5, 0.8, 0.9, 0.9, "shaleDark", cuts=3, noise=0.3, seed=4, bottom=ty - 0.1)

    # --- the walls: north (z = -half) and west (x = -half), a displaced double-sided sheet with a
    # jagged skyline, the adit's mouth left open in the north wall ---
    A = L["adit"]
    wall_top = ty + L["walls"]["height"]

    def wall(axis):
        n_along, n_up = 60, 17
        grid = []
        for i in range(n_along + 1):
            t = -half + 2 * half * i / n_along
            skyline = wall_top + 1.1 * fbm(t * 0.35, 3.0, 0.0, 21 if axis == "n" else 23) + 0.4 * math.sin(t * 0.9)
            floor_here = ty if (axis == "n" or t < edge) else 0.0
            column = []
            for j in range(n_up + 1):
                u = j / n_up
                y = -1.4 + (skyline + 1.4) * u
                depth = 0.12 + 0.2 * fbm(t * 0.7, y * 0.7, 5.0 if axis == "n" else 9.0, 31) + 0.08 * math.sin(y * 2.3 + t)
                depth *= smooth(floor_here - 0.2, floor_here + 0.6, y)
                inner = -half + 0.6 - depth
                v = shell.v(t, y, inner) if axis == "n" else shell.v(inner, y, t)
                warmth = smooth(-4.0, -8.0, t) if axis == "w" else 1.0
                base = lin(C["shell"]) if (axis == "n" or t < edge) else lin(C["shellCold"])
                strata = 0.07 * math.sin(y * 3.1 + fbm(t, y, 1, 8) * 2.0)
                shell.setv(v, tuple(max(0.0, base[m] * (1 + strata) * (0.85 + 0.15 * warmth)) for m in range(3)))
                column.append(v)
            grid.append(column)
        for i in range(n_along):
            t = -half + 2 * half * (i + 0.5) / n_along
            for j in range(n_up):
                y = -1.4 + (wall_top + 1.4) * (j + 0.5) / n_up
                if axis == "n" and A["x"] - A["w"] / 2 - 0.05 < t < A["x"] + A["w"] / 2 + 0.05 and ty - 0.1 < y < ty + A["h"] + 0.15:
                    continue
                warmth = smooth(-4.0, -8.0, t) if axis == "w" else 1.0
                base = lin(C["shell"]) if (axis == "n" or t < edge) else lin(C["shellCold"])
                strata = 0.07 * math.sin(y * 3.1 + fbm(t, y, 1, 8) * 2.0)
                col = tuple(max(0.0, base[m] * (1 + strata) * (0.85 + 0.15 * warmth)) for m in range(3))
                a, b = grid[i][j], grid[i + 1][j]
                c2, d2 = grid[i + 1][j + 1], grid[i][j + 1]
                shell.setsmooth(shell.face((a, b, c2, d2) if axis == "n" else (b, a, d2, c2), col))
        # the skyline's cap
        for i in range(n_along):
            a, b = grid[i][-1], grid[i + 1][-1]
            if axis == "n":
                a2 = shell.bm.verts.new(a.co + Vector((0, 0.9, 0)))
                b2 = shell.bm.verts.new(b.co + Vector((0, 0.9, 0)))
            else:
                a2 = shell.bm.verts.new(a.co + Vector((-0.9, 0, 0)))
                b2 = shell.bm.verts.new(b.co + Vector((-0.9, 0, 0)))
            shell.face((a, b, b2, a2), "shellCold")

    wall("n")
    wall("w")
    # the adit's tunnel into the north wall: a dark recess, timbers round its mouth, rails in, a lantern
    ax0, ax1 = A["x"] - A["w"] / 2, A["x"] + A["w"] / 2
    box(rock, ax0 - 0.1, ax1 + 0.1, ty - 0.02, ty + A["h"] + 0.1, -half - 1.8, -half + 0.05, "tunnel", bottom=False)
    for sx in (ax0 - 0.12, ax1 + 0.12):
        box(rock, sx - 0.12, sx + 0.12, ty, ty + A["h"] + 0.15, -half + 0.4, -half + 0.65, "timber")
    box(rock, ax0 - 0.35, ax1 + 0.35, ty + A["h"], ty + A["h"] + 0.26, -half + 0.35, -half + 0.7, "timberDark")
    for k in range(5):
        z = -half - 1.4 + k * 0.5
        box(rock, ax0 + 0.1, ax1 - 0.1, ty + 0.01, ty + 0.05, z, z + 0.14, "timberDark", bottom=False)
    lathe(glow, ax1 + 0.12, -half + 0.85, [(0, 0), (0.07, 0.02), (0.09, 0.12), (0.07, 0.22), (0, 0.24)], "lanternHot", segs=8, y0=ty + 1.9)
    cyl(rock, (ax1 + 0.12, ty + 2.14, -half + 0.85), (ax1 + 0.12, ty + 2.3, -half + 0.72), 0.012, "iron", sides=5)
    # the rails: from the adit across the terrace toward the forge
    R = L["rails"]
    for (x0, z0), (x1, z1) in zip(R, R[1:]):
        d = math.hypot(x1 - x0, z1 - z0) or 1
        tx, tz = (x1 - x0) / d, (z1 - z0) / d
        nx_, nz_ = -tz, tx
        for side in (-0.28, 0.28):
            a = (x0 + nx_ * side, z0 + nz_ * side)
            b = (x1 + nx_ * side, z1 + nz_ * side)
            q = [(a[0] - nx_ * 0.025, a[1] - nz_ * 0.025), (b[0] - nx_ * 0.025, b[1] - nz_ * 0.025), (b[0] + nx_ * 0.025, b[1] + nz_ * 0.025), (a[0] + nx_ * 0.025, a[1] + nz_ * 0.025)]
            slab(rock, q, ty + 0.02, ty + 0.06, "steel", bottom=False)
        for k in range(int(d / 0.5)):
            cx, cz = x0 + tx * (k + 0.5) * 0.5, z0 + tz * (k + 0.5) * 0.5
            q = [(cx + nx_ * 0.42 - tx * 0.07, cz + nz_ * 0.42 - tz * 0.07), (cx + nx_ * 0.42 + tx * 0.07, cz + nz_ * 0.42 + tz * 0.07), (cx - nx_ * 0.42 + tx * 0.07, cz - nz_ * 0.42 + tz * 0.07), (cx - nx_ * 0.42 - tx * 0.07, cz - nz_ * 0.42 - tz * 0.07)]
            slab(rock, q, ty + 0.005, ty + 0.03, "timberDark", bottom=False)

    # --- the grand stair: fourteen steps down the cliff (the game walks a smooth 28 degree ramp over
    # them), low stone parapets either side ---
    steps = 14
    run = (S["foot"] - S["top"]) / steps
    rise = ty / steps
    for i in range(steps):
        z0 = S["top"] + i * run
        top = ty - (i + 0.5) * rise
        box(rock, S["x0"], S["x1"], 0.0, top, z0, z0 + run, "stoneLight", top="flag", bottom=False)
    for sx0, sx1 in ((S["x0"] - 0.25, S["x0"]), (S["x1"], S["x1"] + 0.25)):
        for i in range(steps):
            z0 = S["top"] + i * run
            top = ty - i * rise + 0.36
            box(rock, sx0, sx1, 0.0, max(0.36, top - rise * 0.5), z0, z0 + run, "stoneDark", bottom=False)

    # --- the terrace's edge: a timber rail along the cliff (not over the stair), lanterns on it ---
    for x0, x1 in ((-half + 0.3, S["x0"] - 0.3), (S["x1"] + 0.3, half - 0.3)):
        n = max(2, int((x1 - x0) / 1.6))
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n
            box(rock, x - 0.06, x + 0.06, ty, ty + 0.95, edge - 0.18, edge - 0.06, "timber")
        for y in (ty + 0.5, ty + 0.9):
            box(rock, x0, x1, y - 0.04, y + 0.03, edge - 0.16, edge - 0.08, "timberDark")
    for x in (-10.5, -6.0, 4.5, 11.5):
        box(rock, x - 0.07, x + 0.07, ty, ty + 1.3, edge - 0.2, edge - 0.06, "timber")
        cyl(rock, (x, ty + 1.3, edge - 0.13), (x, ty + 1.3, edge - 0.45), 0.025, "iron", sides=5)
        lathe(glow, x, edge - 0.45, [(0, 0), (0.08, 0.02), (0.1, 0.14), (0.08, 0.26), (0, 0.28)], "lantern", segs=8, y0=ty + 0.92)

    # --- Gus's workshop: shelves of gems and ore against the wall, crates, a barrel, his counter ---
    Wk = L["workshop"]
    for sx in (Wk["x0"] + 0.9, Wk["x1"] - 1.3):
        for k in range(4):
            box(rock, sx - 0.7, sx + 0.7, ty + 0.3 + k * 0.62, ty + 0.36 + k * 0.62, -half + 0.6, -half + 1.1, "plank")
        for dx in (-0.7, 0.7):
            box(rock, sx + dx - 0.05, sx + dx + 0.05, ty, ty + 2.6, -half + 0.62, -half + 1.08, "timberDark")
        for k in range(3):
            for g in range(4):
                gx = sx - 0.5 + g * 0.33
                blob(glow, gx, ty + 0.46 + k * 0.62, -half + 0.85, 0.06, 0.08, 0.06, ["cyan", "violetSoft", "gemRed", "gemGreen"][(g + k) % 4], cuts=1)
    box(rock, Wk["x0"] + 0.2, Wk["x0"] + 1.0, ty, ty + 0.7, Wk["z1"] - 1.2, Wk["z1"] - 0.4, "timber")
    box(rock, Wk["x0"] + 0.25, Wk["x0"] + 0.95, ty + 0.7, ty + 1.3, Wk["z1"] - 1.1, Wk["z1"] - 0.5, "timberDark")
    lathe(rock, Wk["x1"] - 0.4, Wk["z1"] - 0.6, [(0, 0), (0.26, 0), (0.3, 0.25), (0.28, 0.6), (0, 0.62)], "timber", segs=12, y0=ty)
    blob(rock, Wk["x1"] - 1.2, ty + 0.25, Wk["z1"] - 0.5, 0.3, 0.26, 0.26, "sack", cuts=2, bottom=ty)
    blob(rock, Wk["x1"] - 1.25, ty + 0.55, Wk["z1"] - 0.5, 0.12, 0.08, 0.12, "coal", cuts=2)
    # the sign over the workshop: a board on chains
    box(rock, -9.0, -7.0, ty + 2.55, ty + 2.95, Wk["z1"] - 0.25, Wk["z1"] - 0.18, "plank")
    for k in range(5):
        blob(rock, -8.6 + k * 0.3, ty + 2.75, Wk["z1"] - 0.15, 0.08, 0.1, 0.02, "leather", cuts=1)
    Cn = L["counter"]
    box(rock, Cn["x"] - Cn["len"] / 2, Cn["x"] + Cn["len"] / 2, ty, ty + Cn["top"] - 0.06, Cn["z"] - Cn["w"] / 2, Cn["z"] + Cn["w"] / 2, "timber")
    box(rock, Cn["x"] - Cn["len"] / 2 - 0.04, Cn["x"] + Cn["len"] / 2 + 0.04, ty + Cn["top"] - 0.06, ty + Cn["top"], Cn["z"] - Cn["w"] / 2 - 0.04, Cn["z"] + Cn["w"] / 2 + 0.04, "iron")
    # on it: his scales, a lantern, a tray of ore
    cyl(rock, (Cn["x"] + 0.6, ty + Cn["top"], Cn["z"]), (Cn["x"] + 0.6, ty + Cn["top"] + 0.4, Cn["z"]), 0.02, "brass", sides=6)
    for sx in (-0.18, 0.18):
        lathe(rock, Cn["x"] + 0.6 + sx, Cn["z"], [(0, 0), (0.1, 0.0), (0.12, 0.03), (0, 0.03)], "brass", segs=10, y0=ty + Cn["top"] + 0.24)
    cyl(rock, (Cn["x"] + 0.42, ty + Cn["top"] + 0.4, Cn["z"]), (Cn["x"] + 0.78, ty + Cn["top"] + 0.4, Cn["z"]), 0.012, "brass", sides=5)
    lathe(glow, Cn["x"] - 0.75, Cn["z"], [(0, 0), (0.08, 0.02), (0.1, 0.14), (0.08, 0.26), (0, 0.28)], "lanternHot", segs=8, y0=ty + Cn["top"])
    box(rock, Cn["x"] - 0.3, Cn["x"] + 0.25, ty + Cn["top"], ty + Cn["top"] + 0.05, Cn["z"] - 0.18, Cn["z"] + 0.18, "timberDark")
    for k in range(5):
        blob(rock, Cn["x"] - 0.2 + (k % 3) * 0.16, ty + Cn["top"] + 0.08, Cn["z"] - 0.06 + (k // 3) * 0.12, 0.05, 0.035, 0.05, ["copperNug", "ironNug", "silverVein", "coal", "copperNug"][k], cuts=1)
    # a little mine cart on the rails at the tunnel's mouth
    cx, cz = L["rails"][0]
    box(rock, cx - 0.36, cx + 0.36, ty + 0.2, ty + 0.72, cz + 0.2, cz + 0.95, "iron")
    blob(rock, cx, ty + 0.72, cz + 0.58, 0.3, 0.12, 0.3, "coal", cuts=2)
    for sx in (-0.3, 0.3):
        for sz in (0.35, 0.8):
            cyl(rock, (cx + sx - 0.04, ty + 0.14, cz + sz), (cx + sx + 0.04, ty + 0.14, cz + sz), 0.12, "iron", sides=8)

    # --- the Ancient Forge: stone, an arched mouth glowing deep orange, a chimney up the wall, a coal
    # heap, bellows, a trough ---
    F = L["forge"]
    fx0, fx1 = F["x"] - F["w"] / 2, F["x"] + F["w"] / 2
    fz0, fz1 = F["z"] - F["d"] / 2, F["z"] + F["d"] / 2
    for k in range(6):
        y0 = ty + k * 0.42
        inset = 0.04 * k
        for kx in range(4):
            bx0 = fx0 + inset + (fx1 - fx0 - 2 * inset) * kx / 4
            bx1 = fx0 + inset + (fx1 - fx0 - 2 * inset) * (kx + 1) / 4
            box(rock, bx0 + 0.01, bx1 - 0.01, y0, y0 + 0.4, fz0 + inset, fz1 - inset, "stoneRim" if (k + kx) % 2 else "flagDark", bottom=False)
    box(rock, F["x"] - 0.45, F["x"] + 0.45, ty + F["h"] - 0.2, wall_top - 0.6, -half + 0.6, fz0 + 0.55, "stoneDark", bottom=False)
    # the mouth, a glowing arch
    pts = [glow.v(x, y, fz1 + 0.005) for x, y in [(F["x"] + 0.5, ty + 0.35)] + [(F["x"] + 0.5 * math.cos(a), ty + 0.9 + 0.55 * math.sin(a)) for a in (math.pi * k / 10 for k in range(11))] + [(F["x"] - 0.5, ty + 0.35)]]
    glow.face(pts, "forgeMouth")
    blob(glow, F["x"], ty + 0.55, fz1 - 0.1, 0.35, 0.16, 0.2, "forgeCore", cuts=2)
    for k in range(9):
        blob(rock, F["x"] + 1.5 + (k % 3) * 0.18, ty + 0.1 + (k // 3) * 0.1, fz1 - 0.3 + (k % 2) * 0.15, 0.12, 0.08, 0.12, "coal", cuts=1)
    # the bellows, the trough of water, two ingot molds
    blob(rock, fx0 - 0.35, ty + 0.55, F["z"] + 0.2, 0.2, 0.14, 0.32, "leather", cuts=2)
    box(rock, fx0 - 0.5, fx0 - 0.2, ty, ty + 0.4, F["z"] - 0.1, F["z"] + 0.5, "timber")
    box(rock, fx1 + 0.15, fx1 + 0.75, ty, ty + 0.45, fz1 - 0.35, fz1 + 0.05, "timberDark")
    box(glow, fx1 + 0.2, fx1 + 0.7, ty + 0.42, ty + 0.44, fz1 - 0.3, fz1, "cyanSoft", bottom=False)

    # --- the Geode Anvil: a stump, an iron anvil, a cracked geode's halves ---
    Av = L["anvil"]
    lathe(rock, Av["x"], Av["z"], [(0, 0), (0.34, 0), (0.33, 0.5), (0.31, 0.55), (0, 0.55)], "timber", segs=14, y0=ty)
    box(rock, Av["x"] - 0.28, Av["x"] + 0.22, ty + 0.55, ty + 0.72, Av["z"] - 0.12, Av["z"] + 0.12, "iron")
    box(rock, Av["x"] - 0.34, Av["x"] + 0.3, ty + 0.72, ty + 0.84, Av["z"] - 0.14, Av["z"] + 0.14, "iron")
    cone(rock, (Av["x"] + 0.3, ty + 0.78, Av["z"]), (Av["x"] + 0.5, ty + 0.8, Av["z"]), 0.06, "iron", sides=6)
    for sx in (-0.5, 0.55):
        blob(rock, Av["x"] + sx, ty + 0.08, Av["z"] + 0.35, 0.1, 0.08, 0.1, "stoneLight", cuts=2, bottom=ty)
        blob(glow, Av["x"] + sx, ty + 0.13, Av["z"] + 0.35, 0.06, 0.02, 0.06, "violetSoft", cuts=1)

    # --- the onsen: its bowl sunk into the terrace, the submerged ledge, a rim of rounded stones,
    # two stone lanterns, towels and a bucket ---
    ox0, ox1 = O["x"] - O["w"] / 2, O["x"] + O["w"] / 2
    oz0, oz1 = O["z"] - O["d"] / 2, O["z"] + O["d"] / 2
    bed = ty - O["depth"]
    box(rock, ox0, ox1, bed - 0.05, bed, oz0, oz1, "onsenStone", bottom=False)
    # the bowl's inner walls
    for x0, x1, z0, z1 in ((ox0, ox1, oz0 - 0.02, oz0), (ox0, ox1, oz1, oz1 + 0.02), (ox0 - 0.02, ox0, oz0, oz1), (ox1, ox1 + 0.02, oz0, oz1)):
        box(rock, x0, x1, bed, ty, z0, z1, "onsenStone", bottom=False)
    # the ledges the seats are on (north and south): their tops at the game's onsenLedge
    for z0, z1 in ((oz0, oz0 + 0.55), (oz1 - 0.55, oz1)):
        box(rock, ox0 + 0.1, ox1 - 0.1, bed, ty + ledge_top, z0, z1, "onsenStone", bottom=False)
    for k in range(34):
        t = k / 34
        per = 2 * (O["w"] + O["d"])
        s = t * per
        if s < O["w"]:
            x, z = ox0 + s, oz0 - 0.12
        elif s < O["w"] + O["d"]:
            x, z = ox1 + 0.12, oz0 + (s - O["w"])
        elif s < 2 * O["w"] + O["d"]:
            x, z = ox1 - (s - O["w"] - O["d"]), oz1 + 0.12
        else:
            x, z = ox0 - 0.12, oz1 - (s - 2 * O["w"] - O["d"])
        blob(rock, x, ty + 0.05, z, 0.24 + 0.05 * rng.random(), 0.13 + 0.05 * rng.random(), 0.22 + 0.05 * rng.random(), "onsenStone", cuts=2, noise=0.15, seed=300 + k, bottom=ty - 0.1)
    for lx, lz in ((ox0 - 0.45, oz0 - 0.45), (ox1 + 0.45, oz1 + 0.45)):
        box(rock, lx - 0.22, lx + 0.22, ty, ty + 0.12, lz - 0.22, lz + 0.22, "stoneRim")
        box(rock, lx - 0.08, lx + 0.08, ty + 0.12, ty + 0.62, lz - 0.08, lz + 0.08, "stoneRim")
        box(rock, lx - 0.2, lx + 0.2, ty + 0.62, ty + 0.86, lz - 0.2, lz + 0.2, "stoneRim")
        box(glow, lx - 0.13, lx + 0.13, ty + 0.66, ty + 0.82, lz - 0.13, lz + 0.13, "lantern")
        slab(rock, [(lx - 0.3, lz - 0.3), (lx + 0.3, lz - 0.3), (lx + 0.3, lz + 0.3), (lx - 0.3, lz + 0.3)], ty + 0.86, ty + 0.95, "stoneRim")
        cone(rock, (lx, ty + 0.95, lz), (lx, ty + 1.12, lz), 0.26, "stoneRim", sides=4)
    lathe(rock, ox1 + 0.5, oz0 - 0.5, [(0, 0), (0.16, 0), (0.18, 0.24), (0, 0.24)], "timber", segs=10, y0=ty)
    box(rock, ox0 + 0.4, ox0 + 1.1, ty + 0.02, ty + 0.1, oz0 - 0.62, oz0 - 0.36, "towel")
    box(rock, ox0 + 1.3, ox0 + 2.0, ty + 0.02, ty + 0.1, oz0 - 0.62, oz0 - 0.36, "redCloth")

    # --- the Grotto Pool: a bowl in the basin, glowing moss down its sides, a lip of stones ---
    ring_n, rings = 40, 7
    grid = []
    for r in range(rings + 1):
        u = r / rings
        row = []
        for k in range(ring_n):
            a = 2 * math.pi * k / ring_n
            rr = 1.05 * (1 - u) if u < 1 else 0.0
            x = P["x"] + P["rx"] * 1.05 * (1 - u) * math.cos(a)
            z = P["z"] + P["rz"] * 1.05 * (1 - u) * math.sin(a)
            y = P["bed"] * (1 - (1 - u) ** 2) ** 0.55 if u > 0 else 0.0
            row.append(rock.v(x, y, z))
        grid.append(row)
    centre = rock.v(P["x"], P["bed"], P["z"])
    for r in range(rings):
        for k in range(ring_n):
            k1 = (k + 1) % ring_n
            u = (r + 0.5) / rings
            col = lin(C["stoneDark"])
            algae = lin(C["moss"])
            kk = 0.5 + 0.5 * math.sin(k * 1.7 + r * 2.1)
            c = tuple(col[m] + (algae[m] - col[m]) * kk * 0.7 for m in range(3))
            rock.face((grid[r][k], grid[r + 1][k], grid[r + 1][k1], grid[r][k1]), c)
    for k in range(ring_n):
        rock.face((grid[rings][(k + 1) % ring_n], grid[rings][k], centre), "stoneDark")
    # glowing moss and little crystals on the bed
    for k in range(22):
        a = rng.random() * 6.283
        rr = 0.2 + 0.7 * rng.random()
        x, z = P["x"] + P["rx"] * rr * math.cos(a), P["z"] + P["rz"] * rr * math.sin(a)
        depth = P["bed"] * (1 - rr ** 2) ** 0.55
        blob(glow, x, depth + 0.02, z, 0.14, 0.03, 0.14, "algae" if k % 3 else "cyan", cuts=1)
    # the lip: stones overlapping the water's edge all round (not across the pier)
    Pi = L["pier"]
    for k in range(46):
        a = 2 * math.pi * k / 46
        x = P["x"] + (P["rx"] + 0.02) * math.cos(a)
        z = P["z"] + (P["rz"] + 0.02) * math.sin(a)
        if abs(x - Pi["x"]) < Pi["w"] / 2 + 0.15 and z < P["z"]:
            continue
        blob(rock, x, 0.02, z, 0.22 + 0.08 * rng.random(), 0.1 + 0.06 * rng.random(), 0.2 + 0.08 * rng.random(), "stoneLight" if k % 3 else "stone", cuts=2, noise=0.2, seed=400 + k, bottom=-0.25)
    # the water itself, 0.15 m and more over the bed (its edge tucked under the lip)
    water = Mesh("CV_Water")
    wn = 48
    wv = [water.v(P["x"] + (P["rx"] + 0.06) * math.cos(a), P["water"], P["z"] + (P["rz"] + 0.06) * math.sin(a)) for a in (2 * math.pi * k / wn for k in range(wn))]
    wc = water.v(P["x"], P["water"], P["z"])
    for k in range(wn):
        water.face((wc, wv[(k + 1) % wn], wv[k]), "water")
    # the weathered pier: planks on posts, from the north shore out over the water
    for k in range(int((Pi["z1"] - Pi["z0"]) / 0.24)):
        z = Pi["z0"] + k * 0.24
        box(rock, Pi["x"] - Pi["w"] / 2 + 0.02 * (k % 2), Pi["x"] + Pi["w"] / 2 - 0.02 * ((k + 1) % 2), Pi["deck"] - 0.05, Pi["deck"], z + 0.01, z + 0.22, "plankOld" if k % 3 else "plank")
    for px in (Pi["x"] - Pi["w"] / 2 + 0.08, Pi["x"] + Pi["w"] / 2 - 0.08):
        for pz in (Pi["z0"] + 0.9, Pi["z1"] - 0.15):
            cyl(rock, (px, P["bed"] * 0.8, pz), (px, Pi["deck"] + 0.18, pz), 0.07, "timberDark", sides=8)
    box(rock, Pi["x"] - Pi["w"] / 2, Pi["x"] + Pi["w"] / 2, Pi["deck"] - 0.14, Pi["deck"] - 0.05, Pi["z1"] - 0.2, Pi["z1"] - 0.08, "timberDark")

    # --- the Center Sanctuary's dais: a ring of runes round the Monolith's spot ---
    D = L["dais"]
    rn = 36
    for k in range(rn):
        if k % 3 == 2:
            continue
        a0, a1 = 2 * math.pi * k / rn, 2 * math.pi * (k + 0.8) / rn
        r0, r1 = D["r"] - 0.16, D["r"] - 0.04
        q = [(D["x"] + r0 * math.cos(a0), D["z"] + r0 * math.sin(a0)), (D["x"] + r1 * math.cos(a0), D["z"] + r1 * math.sin(a0)), (D["x"] + r1 * math.cos(a1), D["z"] + r1 * math.sin(a1)), (D["x"] + r0 * math.cos(a1), D["z"] + r0 * math.sin(a1))]
        glow.face([glow.v(x, 0.025, z) for x, z in reversed(q)], "rune")
    for k in range(8):
        a = 2 * math.pi * k / 8
        x, z = D["x"] + (D["r"] + 0.25) * math.cos(a), D["z"] + (D["r"] + 0.25) * math.sin(a)
        if abs(x - 0) < 1.2 and z < D["z"]:
            continue
        blob(rock, x, 0.18, z, 0.16, 0.24, 0.16, "flagDark", cuts=2, noise=0.1, seed=500 + k, bottom=0.0)

    # --- crystal clusters and glowing mushrooms, stalagmites along the walls ---
    for x, z, s in L["crystals"]:
        y0 = ty if z < edge else 0.0
        blob(rock, x, y0 + 0.08 * s, z, 0.34 * s, 0.14 * s, 0.34 * s, "stoneDark", cuts=2, noise=0.25, seed=int(x * 10 + z), bottom=y0 - 0.05)
        colc = "cyan" if (int(x * 7 + z * 3) % 3) else "violet"
        for k in range(5):
            a = rng.random() * 6.283
            lean = 0.25 + 0.4 * rng.random()
            d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
            prism(glow, (x + math.cos(a) * 0.1 * s, y0 + 0.05, z + math.sin(a) * 0.1 * s), d, (0.05 + 0.04 * rng.random()) * s, (0.35 + 0.55 * rng.random()) * s, colc if k % 2 == 0 else (colc + "Soft" if colc + "Soft" in C else colc))
    for x, z, s in L["shrooms"]:
        colc = "shroomTeal" if (int(x * 5 + z) % 2) else "shroomPink"
        for k in range(4):
            a = rng.random() * 6.283
            rr = 0.1 + 0.18 * rng.random()
            hx, hz = x + math.cos(a) * rr * s, z + math.sin(a) * rr * s
            h = (0.15 + 0.3 * rng.random()) * s
            cyl(rock, (hx, 0.0, hz), (hx, h, hz), 0.025 * s + 0.01, "cloth", sides=6)
            lathe(glow, hx, hz, [(0, 0), (0.12 * s, 0.0), (0.1 * s, 0.05 * s), (0.05 * s, 0.08 * s), (0, 0.09 * s)], colc, segs=10, y0=h - 0.01)
    for k in range(18):
        x = -half + 0.5 + rng.random() * 0.5
        z = edge + 0.8 + (half - edge - 1.6) * rng.random()
        cone(rock, (x, 0.0, z), (x + 0.05, 0.5 + 0.9 * rng.random(), z), 0.18 + 0.12 * rng.random(), "stone", sides=7)
    for k in range(10):
        x = -half + 1.0 + (2 * half - 2.0) * rng.random()
        z = -half + 0.55 + 0.4 * rng.random()
        if (L["adit"]["x"] - 1.4 < x < L["adit"]["x"] + 1.4) or (F["x"] - 1.6 < x < F["x"] + 1.6) or (Wk["x0"] - 0.2 < x < Wk["x1"] + 0.2):
            continue
        cone(rock, (x, ty, z), (x, ty + 0.5 + 0.6 * rng.random(), z), 0.18 + 0.1 * rng.random(), "shaleDark", sides=7)

    # --- the overhang over the pool (its pillar on the east rim, its stalactites dripping into the
    # water), and the timber shoring's beams: all dithered away when between you and the camera ---
    Ov = L["overhang"]
    ocx, ocz = (Ov["x0"] + Ov["x1"]) / 2 + 0.4, (Ov["z0"] + Ov["z1"]) / 2
    orx, orz = (Ov["x1"] - Ov["x0"]) / 2, (Ov["z1"] - Ov["z0"]) / 2
    rings_, segs_ = 7, 28

    def arch_pt(u, a, top):
        """The arch's surface: a flattened dome over its footprint, rough; `u` 0 at the rim to 1 at
        the middle, its rim tucked into the east wall past the island's edge."""
        wob = 1 + 0.14 * vnoise(math.cos(a) * 2.2, math.sin(a) * 2.2, 1.3, 41)
        x = ocx + orx * (1 - u) * math.cos(a) * wob
        z = ocz + orz * (1 - u) * math.sin(a) * wob
        x = min(half + 0.3, x)
        thick = 0.25 + 0.75 * math.sin(u * math.pi / 2)
        n_ = 0.18 * fbm(x * 0.9, 2.0, z * 0.9, 43)
        y = Ov["y"] + 0.35 + (thick * 0.55 + n_ if top else -thick * 0.45 + n_ * 0.6)
        return x, y, z

    tops = [[over.v(*arch_pt(r / rings_, 2 * math.pi * k / segs_, True)) for k in range(segs_)] for r in range(rings_)]
    bots = [[over.v(*arch_pt(r / rings_, 2 * math.pi * k / segs_, False)) for k in range(segs_)] for r in range(rings_)]
    top_c = over.v(ocx, Ov["y"] + 1.1, ocz)
    bot_c = over.v(ocx, Ov["y"] - 0.15, ocz)
    for grid_, centre_, up in ((tops, top_c, True), (bots, bot_c, False)):
        for row in grid_:
            for v in row:
                over.setv(v, "stoneDark" if up else "stone")
        over.setv(centre_, "stoneDark" if up else "stone")
        for r in range(rings_ - 1):
            for k in range(segs_):
                k1 = (k + 1) % segs_
                q = (grid_[r][k], grid_[r + 1][k], grid_[r + 1][k1], grid_[r][k1]) if up else (grid_[r][k], grid_[r][k1], grid_[r + 1][k1], grid_[r + 1][k])
                over.setsmooth(over.face(q, "stoneDark" if up else "stone"))
        for k in range(segs_):
            k1 = (k + 1) % segs_
            q = (grid_[-1][k], centre_, grid_[-1][k1]) if up else (grid_[-1][k1], centre_, grid_[-1][k])
            over.setsmooth(over.face(q, "stoneDark" if up else "stone"))
    for k in range(segs_):
        k1 = (k + 1) % segs_
        over.setsmooth(over.face((bots[0][k], bots[0][k1], tops[0][k1], tops[0][k]), "stone"))
    pl = Ov["pillar"]
    cyl(over, (pl["x"], 0.0, pl["z"]), (pl["x"], Ov["y"] + 0.4, pl["z"]), pl["r"] + 0.1, "stone", sides=10, r_end=pl["r"] + 0.3)
    for sx, sz, ln in Ov["stalactites"]:
        cone(over, (sx, Ov["y"] + 0.05, sz), (sx + 0.03, Ov["y"] - ln, sz), 0.2 + 0.05 * ln, "stoneLight", sides=7)
        blob(glow, sx + 0.03, Ov["y"] - ln - 0.02, sz, 0.025, 0.035, 0.025, "cyanSoft", cuts=1)
    for b in L["beams"]:
        by0 = ty if b["z"] < edge else 0.0
        for sx in (-1, 1):
            bx = b["x"] + sx * b["span"] / 2
            box(over, bx - 0.13, bx + 0.13, by0, b["top"], b["z"] - 0.13, b["z"] + 0.13, "timber")
            cyl(over, (bx, b["top"] - 0.7, b["z"]), (bx - sx * 0.55, b["top"] - 0.13, b["z"]), 0.07, "timberDark", sides=6)
        box(over, b["x"] - b["span"] / 2 - 0.25, b["x"] + b["span"] / 2 + 0.25, b["top"], b["top"] + 0.28, b["z"] - 0.16, b["z"] + 0.16, "timberDark")
        cyl(over, (b["x"], b["top"], b["z"] + 0.1), (b["x"], b["top"] - 0.45, b["z"] + 0.1), 0.012, "iron", sides=5)
        lathe(glow, b["x"], b["z"] + 0.1, [(0, 0), (0.08, 0.02), (0.1, 0.14), (0.08, 0.26), (0, 0.28)], "lantern", segs=8, y0=b["top"] - 0.73)

    finish_object("Cave_Rock", rock, coll, mottle=0.12)
    finish_object("Cave_Shell", shell, coll, mottle=0.1)
    finish_object("Cave_Overhang", over, coll, mottle=0.12)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False, recalc=False)
    # the onsen's water
    onsen = Mesh("CV_OnsenWater")
    y = ty + O["water"]
    onsen.face([onsen.v(ox0 - 0.02, y, oz0 - 0.02), onsen.v(ox0 - 0.02, y, oz1 + 0.02), onsen.v(ox1 + 0.02, y, oz1 + 0.02), onsen.v(ox1 + 0.02, y, oz0 - 0.02)], "onsenWater")
    finish_object("Cave_Onsen", onsen, coll, bake=False, recalc=False)


# ---------------------------------------------------------------------------------------------
# the ore nodes' rocks: one template a kind, at the origin, its foot on the floor


def ore_rock(kind, r, coll):
    rock = Mesh("CV_OreRock")
    glow = Mesh("CV_OreGlow")
    rng = random.Random(hash(kind) & 0xFFFF)
    cy = r * 0.72
    if kind == "monolith":
        # a tall obelisk of dark stone, bevelled, cracked with violet runes; broken stones round its foot
        h = 2.6
        levels = 7
        for k in range(levels):
            y0 = h * k / levels
            y1 = h * (k + 1) / levels
            w0 = 0.62 - 0.22 * (k / levels)
            w1 = 0.62 - 0.22 * ((k + 1) / levels)
            twist = 0.06 * k
            ring0 = [(w0 * math.cos(twist + math.pi / 4 + math.pi / 2 * i), w0 * 0.8 * math.sin(twist + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
            ring1 = [(w1 * math.cos(twist + 0.06 + math.pi / 4 + math.pi / 2 * i), w1 * 0.8 * math.sin(twist + 0.06 + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
            lo = [rock.v(x, y0, z) for x, z in ring0]
            hi = [rock.v(x, y1, z) for x, z in ring1]
            for i in range(4):
                j = (i + 1) % 4
                rock.face((lo[i], lo[j], hi[j], hi[i]), "monolith" if (i + k) % 2 else "monolithEdge")
        top = [(0.4 * math.cos(0.42 + math.pi / 4 + math.pi / 2 * i), 0.32 * math.sin(0.42 + math.pi / 4 + math.pi / 2 * i)) for i in range(4)]
        apex = rock.v(0.03, h + 0.5, 0.0)
        tv = [rock.v(x, h, z) for x, z in top]
        for i in range(4):
            rock.face((tv[i], tv[(i + 1) % 4], apex), "monolithEdge")
        for k in range(14):
            y = 0.2 + 2.3 * rng.random()
            a = rng.random() * 6.283
            w = 0.62 - 0.22 * (y / h)
            blob(glow, 0.8 * w * math.cos(a), y, 0.66 * w * math.sin(a), 0.05, 0.16 + 0.1 * rng.random(), 0.05, "runeGlow", cuts=1)
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.3
            blob(rock, 0.95 * math.cos(a), 0.12, 0.95 * math.sin(a), 0.2, 0.14, 0.18, "monolithEdge", cuts=2, noise=0.2, seed=k, bottom=0.0)
    elif kind == "glimmer":
        blob(rock, 0.0, r * 0.25, 0.0, r * 0.95, r * 0.4, r * 0.9, "glimmerBase", cuts=3, noise=0.25, seed=2, bottom=0.0)
        for k in range(9):
            a = 2 * math.pi * k / 9 + rng.random() * 0.4
            lean = 0.2 + 0.5 * rng.random() if k else 0.0
            d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
            prism(glow, (math.cos(a) * r * 0.35 * (k > 0), r * 0.3, math.sin(a) * r * 0.35 * (k > 0)), d, (0.07 + 0.05 * rng.random()) * (1.5 if k == 0 else 1), (0.5 + 0.5 * rng.random()) * (1.6 if k == 0 else 1), "cyan" if k % 3 else "violet")
    else:
        body, fleck, vein = {"coal": ("coalRock", "coalChunk", "ember"), "copper": ("copperRock", "copperNug", "copperGlow"), "iron": ("ironRock", "ironNug", "ironGlow"), "silver": ("silverRock", "silverVein", "silverVein")}[kind]
        blob(rock, 0.0, cy, 0.0, r, r * 0.78, r * 0.92, body, cuts=4, noise=0.28, seed=len(kind), bottom=0.0)
        blob(rock, r * 0.45, cy * 0.4, r * 0.3, r * 0.45, r * 0.35, r * 0.4, body, cuts=2, noise=0.3, seed=len(kind) + 5, bottom=0.0)
        if kind == "iron":
            for k in range(7):
                a = rng.random() * 6.283
                u = -0.2 + 0.9 * rng.random()
                p = (math.cos(a) * r * 0.97 * math.sqrt(1 - u * u * 0.5), cy + u * r * 0.72, math.sin(a) * r * 0.9 * math.sqrt(1 - u * u * 0.5))
                blob(rock, *p, 0.14 * r, 0.1 * r, 0.14 * r, "rust", cuts=1)
        for k in range(9 if kind != "silver" else 5):
            a = rng.random() * 6.283
            u = -0.1 + 0.9 * rng.random()
            s_ = math.sqrt(max(0.05, 1 - u * u))
            p = (math.cos(a) * r * 0.96 * s_, cy + u * r * 0.74, math.sin(a) * r * 0.9 * s_)
            blob(rock, *p, 0.12 * r, 0.1 * r, 0.12 * r, fleck, cuts=1)
        # the veins: glowing streaks on its skin
        for k in range(6 if kind == "silver" else 4):
            a = rng.random() * 6.283
            u = 0.1 + 0.6 * rng.random()
            s_ = math.sqrt(max(0.05, 1 - u * u))
            p = (math.cos(a) * r * 0.99 * s_, cy + u * r * 0.74, math.sin(a) * r * 0.93 * s_)
            blob(glow, *p, (0.05 if kind != "silver" else 0.06) * r * 2, 0.022, 0.05 * r, vein, cuts=1)
    ob_r = finish_object(f"Ore_{kind}", rock, coll, bake=False, mottle=0.1)
    ob_g = finish_object(f"Ore_{kind}_Glow", glow, coll, bake=False)
    ob_g.parent = ob_r
    return ob_r


def build_ores(coll, radii):
    made = [ore_rock(kind, radii[kind], coll) for kind in ("coal", "copper", "iron", "silver", "glimmer", "monolith")]
    rubble = Mesh("CV_OreRock")
    rng = random.Random(99)
    for k in range(9):
        a = rng.random() * 6.283
        rr = 0.35 * rng.random()
        blob(rubble, rr * math.cos(a), 0.06, rr * math.sin(a), 0.12 + 0.08 * rng.random(), 0.07 + 0.05 * rng.random(), 0.11 + 0.07 * rng.random(), "rubble", cuts=1, noise=0.2, seed=k, bottom=0.0)
    made.append(finish_object("Ore_Rubble", rubble, coll, bake=False, mottle=0.1))
    return made


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    LIGHTS.clear()
    L = read_layout(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    build_cavern(L, coll, read_onsen_ledge(root))
    ores = build_ores(coll, read_ore_radii(root))
    return coll, L, ores


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False, export_extras=False, export_vertex_color="ACTIVE", export_normals=True)
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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "verts": len(o.data.vertices), "materials": len(o.data.materials)}
    static = {k: v for k, v in out.items() if not k.startswith("Ore_")}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "verts": sum(v["verts"] for v in out.values()), "staticDrawCalls": sum(v["materials"] for v in static.values())}


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll, L, ores = build(root)
        out = os.path.join(root, "client", "public", "models", "caverns.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
        # (the ore templates sit at the origin: not in the studio's grid)
        for o in list(coll.all_objects):
            if o.name.startswith("Ore_"):
                bpy.data.objects.remove(o, do_unlink=True)
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
