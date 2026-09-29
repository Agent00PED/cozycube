"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b --factory-startup -P scripts/blender/build_caverns.py

Nothing is placed by hand: where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is), and the lake's shore, the
islet and the sandbar from the same functions the game walls the water off with (lakeFactor,
isletFactor, sandbarDistance: ported below). A monumental 45 x 45 natural karst cavern, stylised clay
like the other worlds, every colour a vertex colour and the light painted in (the sun pouring down the
doline, the forge, the warm pools, the cenote's heart, every crystal's and mushroom's glow: only three
lights move in the game). One mesh per finish, so the whole static diorama is six draw calls:

    Cave_Rock       CV_Clay          the ground (the doline's mossy loam, the beach's white and gold
                                     sand sloping into the lake and its bed down to the deep, the
                                     fissures' wet slate, the flowstone), the doline's cliffs and its
                                     flowstone ramp, the Expedition Outpost (Gus's log workstation, the
                                     forge in its basalt fissure, the meteorite anvil, the tool crate),
                                     the travertine terraces' rimstone pools, the islet's boulders,
                                     Finnegan's driftwood outcrop, the boulders, fins and ferns, the
                                     stalactites hugging the walls, the rims and the ground's section
    Cave_Shell      CV_Shell         the cavern's north and west walls, double sided (no void past
                                     them), broken low over the doline where the ceiling fell in
    Cave_Glow       CV_Glow          what glows (the game lights it from its own vertex colours): the
                                     crystals, the mushrooms' caps, the lanterns, the forge's mouth and
                                     its chimney's embers, the gems on Gus's tray
    Cave_Water      CV_Water         the cenote lake's surface (transparent in the game, no depth
                                     write, its caustics the game's), clear aquamarine over the sand
                                     and deep teal over the deep; its edge under the beach's own sand
    Cave_Thermal    CV_ThermalWater  the terraces' warm mineral water and its cascades (the same)
    Cave_Roots      CV_Occluder      the mangrove roots weeping down from the islet's skylight, and its
                                     rim far overhead (the game dithers them where they stand between
                                     you and the camera)

and the ore nodes' rocks, each at the origin (its pivot at the foot of the rock, on its floor), for the
game to place at every node of its kind, instanced:

    Ore_<kind>      CV_OreRock + CV_OreGlow   coal, copper, iron, silver, glimmer, monolith
    Ore_Rubble      CV_OreRock                what a broken node leaves till it grows back: a dark,
                                              rough stump of cracked bedrock (the game's dust motes
                                              linger over it)

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
FINISHES = {"CV_Clay": 0.86, "CV_Shell": 0.9, "CV_Glow": 0.6, "CV_Water": 0.15, "CV_ThermalWater": 0.25, "CV_Occluder": 0.86, "CV_OreRock": 0.8, "CV_OreGlow": 0.55}
DOUBLE_SIDED = {"CV_Shell", "CV_Water", "CV_ThermalWater"}
ORE_RADII = {}

C = {
    # the doline: sunlit moss and loam, ferns, ivy, limestone
    "mossA": "#5E8A3A",
    "mossB": "#86AE4E",
    "loam": "#6E5B3E",
    "earth": "#8A6E4C",
    "sunlit": "#F2D48A",
    "fern": "#4F8A3A",
    "fernLight": "#7DB352",
    "ivy": "#3E7A36",
    "limestone": "#BDB29C",
    "limestoneDark": "#8C8474",
    "flowstone": "#D8CDB4",
    "flowstoneWarm": "#E6D3AE",
    "travertine": "#F0E8D6",
    "travertineShadow": "#CFC3A8",
    "basalt": "#2E2C33",
    "basaltLight": "#48454F",
    "brick": "#8A4A34",
    "meteorite": "#3A3438",
    # the cavern: its shell, the fissures' slate, the beach, the lake's bed
    "shell": "#8A8070",
    "shellCold": "#454D5E",
    "shellDark": "#5A544C",
    "slate": "#3E4656",
    "slateWet": "#2C3340",
    "sand": "#EDE2C8",
    "sandGold": "#E2C892",
    "sandWet": "#C9B68E",
    "bed": "#8FC9BE",
    "bedDeep": "#1D5064",
    "strata": "#6E6456",
    "bedrock": "#2A2622",
    "mossGlow": "#3FB8A8",
    "root": "#6E5F52",
    "rootDark": "#4E4238",
    "driftwood": "#B3A898",
    "driftwoodDark": "#857A6C",
    "foam": "#F4FBF8",
    # wood, metal, cloth
    "timber": "#7A5536",
    "timberDark": "#5A3D27",
    "plank": "#9C7148",
    "iron": "#3A3836",
    "steel": "#8E949C",
    "leather": "#6B4228",
    "cloth": "#C9B79A",
    "sack": "#B59B72",
    "redCloth": "#B3403A",
    "coal": "#1E1C20",
    "coalChunk": "#16151A",
    "tunnel": "#0D0C11",
    "waterDark": "#27424A",
    "stoneDark": "#4A4550",
    "shroomStem": "#D9D2C6",
    # glows
    "lantern": "#FFB347",
    "lanternHot": "#FFD58A",
    "forgeMouth": "#FF7A2F",
    "forgeCore": "#FFD27A",
    "ember": "#FF8A3A",
    "cyan": "#00F0FF",
    "violet": "#9D00FF",
    "cyanSoft": "#6FF6FF",
    "violetSoft": "#C58BFF",
    "shroomTeal": "#4FFFD2",
    "shroomPink": "#FF7AD9",
    "gemRed": "#FF5A6E",
    # water
    "aquaShallow": "#9AF0E2",
    "aqua": "#38C2C4",
    "aquaDeep": "#0F5F7C",
    "thermalWater": "#D9F2EC",
    # ores
    "coalRock": "#3B3632",
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
    "rubble": "#2F2B30",
    "rubbleCrack": "#1A181C",
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


def read_thermal_ledge(root):
    """The thermal pools' submerged seat's top, under the water's surface (shared/seats.ts)."""
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    m = re.search(r"\bthermalLedge: \{ y: (-?[0-9.]+), h: ([0-9.]+) \}", src)
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
    if cuts > 0:
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
    """The cavern's own light: the doline's sun-warmed air, the lake's cool aquamarine glow, the
    fissures' dark, dimmer up the walls (but where the sun falls down the doline)."""
    x, y, z = p
    doline = smooth(-7.5, -11.5, z) * smooth(14.0, 10.5, abs(x))
    lakeside = smooth(16.0, 9.0, math.hypot(x / 1.3, z - 8.0))
    warm = (0.86, 0.8, 0.66)
    cool = (0.52, 0.6, 0.66)
    dark = (0.34, 0.38, 0.5)
    base = tuple(dark[i] + (cool[i] - dark[i]) * lakeside for i in range(3))
    a = tuple(base[i] + (warm[i] - base[i]) * doline for i in range(3))
    fade = 1 - 0.4 * smooth(6.0, 12.0, y) * (1 - doline)
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
    if name in ("CV_Water", "CV_ThermalWater"):
        bsdf.inputs["Alpha"].default_value = 0.6 if name == "CV_Water" else 0.62
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


# ---------------------------------------------------------------------------------------------
# the karst: the same ground the game walks (shared/worlds/caverns.ts: lakeFactor, isletFactor,
# sandbarDistance, cavernsFloorY), so the water modelled is the water walled off


def lake_factor(L, x, z):
    K = L["lake"]
    dx = (x - K["x"]) / K["rx"]
    dz = (z - K["z"]) / K["rz"]
    a = math.atan2(dz, dx)
    wob = 1 + 0.05 * math.sin(3 * a + 0.7) + 0.035 * math.sin(5 * a + 2.1)
    return math.hypot(dx, dz) / wob


def islet_factor(L, x, z):
    I = L["islet"]
    dx, dz = x - I["x"], z - I["z"]
    a = math.atan2(dz, dx)
    r = I["r"] * (1 + 0.12 * math.sin(3 * a + 1.0) + 0.06 * math.sin(7 * a + 0.4))
    return math.hypot(dx, dz) / r


def sandbar_distance(L, x, z):
    best = 1e9
    P = L["sandbar"]["points"]
    for (ax, az), (bx, bz) in zip(P, P[1:]):
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)))
        best = min(best, math.hypot(x - (ax + vx * t), z - (az + vz * t)))
    return best


def smooth01(t):
    k = max(0.0, min(1.0, t))
    return k * k * (3 - 2 * k)


def in_doline(L, x, z):
    D = L["doline"]
    return D["x0"] <= x <= D["x1"] and z <= D["z1"]


def plateau_y(L, x, z):
    D = L["doline"]
    return D["y"] + D["rise"] * smooth01((abs(x) - 4) / 7) * smooth01((D["z1"] - 3 - z) / 7)


def ground_y(L, x, z):
    """The cavern floor's height outside the doline: the beach sloping into the lake, its bed, the
    islet and the sandbar standing out of it."""
    K = L["lake"]
    f = lake_factor(L, x, z)
    if f >= K["beach"]:
        return 0.0
    if f >= 1.0:
        y = -0.2 * (K["beach"] - f) / (K["beach"] - 1)
    else:
        y = -0.2 - (K["depth"] - 0.2) * smooth01((1.0 - f) / 0.62)
    # the islet: its top 0.3 m out of the water, its rock sloping down under it
    g = islet_factor(L, x, z)
    top = L["islet"]["top"]
    sb = L["sandbar"]["y"]
    if g < 0.6:
        y = max(y, top)
    elif g < 0.95:
        y = max(y, sb + (top - sb) * smooth01((0.95 - g) / 0.35))
    elif g < 1.45:
        y = max(y, sb - 1.6 * smooth01((g - 0.95) / 0.5))
    # the sandbar: a low spine of sand wading out to it
    d = sandbar_distance(L, x, z)
    half = L["sandbar"]["half"]
    if d < half + 1.0:
        y = max(y, sb - 0.9 * smooth01((d - half + 0.15) / 1.0))
    return y


# ---------------------------------------------------------------------------------------------
# the Grand Karst


def build_cavern(L, coll, ledge_top):
    half = L["half"]
    D = L["doline"]
    R = L["ramp"]
    K = L["lake"]
    I = L["islet"]
    T = L["terraces"]
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    rng = random.Random(11)

    # --- the light painted in: the sun down the doline, the forge, the warm pools, the cenote's
    # heart and its skylight, the lanterns, every crystal and mushroom ---
    lt = L["lights"]
    add_light(0.0, 13.0, -16.5, "#FFD27A", 2.6, 17.0)  # the sun through the collapsed ceiling
    add_light(-6.0, 9.0, -20.5, "#FFE2A8", 1.3, 9.0)
    add_light(6.0, 9.0, -20.5, "#FFE2A8", 1.3, 9.0)
    add_light(*lt["forge"], "#FF8A3A", 2.6, 8.0)
    add_light(*lt["thermal"], "#FFE9C4", 1.5, 7.5)
    add_light(*lt["cenote"], "#35E6FF", 1.9, 10.0)
    add_light(L["skylight"]["x"], 9.0, L["skylight"]["z"], "#D6ECFF", 1.4, 11.0)  # the islet's skylight
    add_light(L["finnegan"]["x"] - 0.6, 1.6, L["finnegan"]["z"] + 0.4, "#FFB347", 1.2, 4.5)  # Finnegan's lantern
    add_light(L["gus"]["x"] + 0.9, D["y"] + 1.3, L["workstation"]["z"], "#FFB347", 1.3, 4.5)  # Gus's lantern
    add_light(L["adit"]["x"] + 1.3, D["y"] + 2.0, L["adit"]["z"] + 0.6, "#FFB347", 1.3, 4.5)  # the adit's lantern
    for x, z, s in L["crystals"]:
        add_light(x, 0.6 * s, z, "#00F0FF" if (int(x * 7 + z * 3) % 3) else "#9D00FF", 0.95 * s, 2.8 * s + 0.6)
    for x, z, s in L["shrooms"]:
        add_light(x, 0.45 * s, z, "#4FFFD2" if (int(x * 5 + z) % 2) else "#FF7AD9", 0.75 * s, 2.3 * s + 0.5)

    lake = lambda x, z: lake_factor(L, x, z)

    # --- the cavern's floor (outside the doline): sand down to the lake and under it, the bed
    # darkening to the deep; wet slate in the fissure wings, flowstone by the terraces ---
    def floor_col(x, z):
        f = lake(x, z)
        y = ground_y(L, x, z)
        slate = lin(C["slate"])
        wet = lin(C["slateWet"])
        n = 0.5 + 0.5 * vnoise(x * 0.45, 0.0, z * 0.45, 3)
        c = [slate[i] + (wet[i] - slate[i]) * n for i in range(3)]
        # the flowstone round the terraces and under the doline's cliff
        flow = max(smooth(-13.5, -16.5, x) * smooth(-9.0, -7.0, z) * smooth(8.0, 6.0, z), smooth(-6.0, -9.5, z) * smooth(13.0, 11.0, abs(x)))
        fl = lin(C["flowstone"])
        c = [c[i] + (fl[i] - c[i]) * flow * 0.85 for i in range(3)]
        # the sand: the beach, gold and white, wet at the waterline
        sand = smooth(1.45, 1.12, f)
        s = lin(C["sand"]) if vnoise(x * 0.8, 1.0, z * 0.8, 5) > -0.1 else lin(C["sandGold"])
        c = [c[i] + (s[i] - c[i]) * sand for i in range(3)]
        if f < 1.1:
            ws = lin(C["sandWet"])
            k = smooth(1.1, 1.0, f)
            c = [c[i] + (ws[i] - c[i]) * k for i in range(3)]
        # the bed under the water: pale sand shoals, then the deep's teal stone
        if y < -0.22:
            deep = smooth(-0.3, -2.0, y)
            b0, b1 = lin(C["bed"]), lin(C["bedDeep"])
            c = [b0[i] + (b1[i] - b0[i]) * deep for i in range(3)]
        # the islet's limestone and moss, the sandbar's sand
        g = islet_factor(L, x, z)
        if g < 1.0:
            lm = lin(C["limestone"]) if g > 0.62 else lin(C["mossA"] if vnoise(x * 1.3, 2.0, z * 1.3, 8) > 0 else C["mossB"])
            c = [c[i] + (lm[i] - c[i]) * smooth(1.0, 0.8, g) for i in range(3)]
        if sandbar_distance(L, x, z) < L["sandbar"]["half"] + 0.3 and y > -0.2:
            c = list(lin(C["sand"]))
        # the glowing moss creeping round the crystals and the mushrooms
        for cx, cz, cs in L["crystals"] + L["shrooms"]:
            d = math.hypot(x - cx, z - cz)
            if d < 1.6 * cs:
                gm = lin(C["mossGlow"])
                k = 0.35 * smooth(1.6 * cs, 0.3, d)
                c = [c[i] + (gm[i] - c[i]) * k for i in range(3)]
        return tuple(c)

    def floor_h(x, z):
        return ground_y(L, x, z) + (0.02 * fbm(x * 0.9, 0, z * 0.9, 4) if lake(x, z) > K["beach"] else 0.0)

    def floor_keep(x, z):
        if in_doline(L, x, z):
            return False
        return not (R["x0"] < x < R["x1"] and R["top"] < z < R["foot"] - 0.2)

    quad_grid(rock, -half, half, -half, half, 0.75, floor_h, floor_col, keep=floor_keep)

    # --- the Sunlit Doline: its mossy plateau (a packed-earth trail from the adit down to the ramp),
    # sunlit pools of light where the beams fall ---
    beams = L["beams"]

    def doline_col(x, z):
        n = vnoise(x * 0.55, 0.0, z * 0.55, 13)
        a, b = lin(C["mossA"]), lin(C["loam"])
        k = smooth(-0.25, 0.45, n)
        c = [b[i] + (a[i] - b[i]) * k for i in range(3)]
        c2 = lin(C["mossB"])
        k2 = smooth(0.35, 0.8, vnoise(x * 1.4, 3.0, z * 1.4, 17))
        c = [c[i] + (c2[i] - c[i]) * k2 * 0.6 for i in range(3)]
        # the trail: packed earth from the tunnel to the ramp, and round the outpost
        trail = smooth(1.3, 0.7, abs(x + 0.35 * math.sin(z * 0.45))) * smooth(-21.5, -20.5, z)
        near_out = smooth(2.6, 1.4, math.hypot(x - L["workstation"]["x"], z - (L["workstation"]["z"] + 0.9)))
        near_forge = smooth(2.8, 1.6, math.hypot(x - L["forge"]["x"], z - (L["forge"]["z"] + 1.6)))
        near_anvil = smooth(2.0, 1.1, math.hypot(x - L["anvil"]["x"], z - L["anvil"]["z"]))
        e = lin(C["earth"])
        k3 = max(trail, near_out, near_forge, near_anvil)
        c = [c[i] + (e[i] - c[i]) * k3 for i in range(3)]
        # the sun's pools on the floor
        for bx, bz, br in beams:
            d = math.hypot(x - bx, z - bz)
            if d < br * 1.3:
                sun = lin(C["sunlit"])
                kk = 0.45 * smooth(br * 1.3, br * 0.4, d)
                c = [c[i] + (sun[i] - c[i]) * kk for i in range(3)]
        return tuple(c)

    quad_grid(rock, D["x0"], D["x1"], D["z0"], D["z1"], 0.6, lambda x, z: plateau_y(L, x, z) + 0.03 * fbm(x * 1.1, 0, z * 1.1, 6), doline_col)

    # --- the doline's cliffs: its front (but for the ramp) and its two sides, displaced limestone with
    # flowstone curtains and ivy hanging down from the moss ---
    def cliff(points, outward, top_at, seed):
        """A cliff face down from the plateau's edge to the floor along a polyline, pushed out a
        little (`outward`, on the ground), rippled like flowstone."""
        n_up = 7
        rows = []
        for (px, pz) in points:
            top = top_at(px, pz)
            col_ = []
            for j in range(n_up + 1):
                y = -0.25 + (top + 0.25) * j / n_up
                bulge = 0.14 + 0.12 * fbm(px * 0.9, y * 0.9, pz * 0.9, seed) + 0.06 * math.sin(px * 2.3 + pz * 1.7 + y)
                bulge *= 1 - smooth(top - 0.35, top, y)
                v = rock.v(px + outward[0] * bulge, y, pz + outward[1] * bulge)
                base = lin(C["limestone"])
                streak = 0.5 + 0.5 * math.sin((px + pz) * 4.1 + fbm(px, y, pz, 2) * 3)
                fl = lin(C["flowstone"])
                cc = [base[m] + (fl[m] - base[m]) * streak * 0.6 for m in range(3)]
                # ivy trailing down from the moss above
                if fbm(px * 0.8, y * 0.5, pz * 0.8, seed + 3) > 0.12 and y > top - 1.6:
                    iv = lin(C["ivy"])
                    cc = [cc[m] * 0.3 + iv[m] * 0.7 for m in range(3)]
                rock.setv(v, tuple(cc))
                col_.append(v)
            rows.append(col_)
        for i in range(len(rows) - 1):
            for j in range(n_up):
                a, b, c2, d2 = rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]
                quad = (a, b, c2, d2) if outward[0] * (points[i + 1][1] - points[i][1]) - outward[1] * (points[i + 1][0] - points[i][0]) < 0 else (b, a, d2, c2)
                rock.setsmooth(rock.face(quad, "limestone"))

    step = 0.6
    front_w = [(x, D["z1"]) for x in frange(D["x0"], R["x0"], step)]
    front_e = [(x, D["z1"]) for x in frange(R["x1"], D["x1"], step)]
    side_w = [(D["x0"], z) for z in frange(D["z0"], D["z1"], step)]
    side_e = [(D["x1"], z) for z in frange(D["z0"], D["z1"], step)]
    cliff(front_w, (0, 1), lambda x, z: plateau_y(L, x, z), 41)
    cliff(front_e, (0, 1), lambda x, z: plateau_y(L, x, z), 43)
    cliff(side_w, (-1, 0), lambda x, z: plateau_y(L, x, z), 45)
    cliff(side_e, (1, 0), lambda x, z: plateau_y(L, x, z), 47)
    # the plateau's rim: a rounded lip of moss and stone along its edges (not across the ramp)
    for pts in (front_w, front_e, side_w, side_e):
        for k, (px, pz) in enumerate(pts[::2]):
            blob(rock, px, plateau_y(L, px, pz) + 0.04, pz, 0.38 + 0.12 * rng.random(), 0.12 + 0.06 * rng.random(), 0.36, "mossA" if k % 3 else "limestone", cuts=1, noise=0.25, seed=k)
    # hanging ivy strands and flowstone draperies down the front cliff
    for k in range(34):
        px = D["x0"] + 0.6 + (D["x1"] - D["x0"] - 1.2) * rng.random()
        if R["x0"] - 0.4 < px < R["x1"] + 0.4:
            continue
        ln = 0.6 + 1.3 * rng.random()
        top = plateau_y(L, px, D["z1"])
        cyl(rock, (px, top, D["z1"] + 0.28), (px + 0.05, top - ln, D["z1"] + 0.34), 0.02, "ivy", sides=4, cap=False)
        for j in range(3):
            blob(rock, px + 0.05, top - ln * (j + 1) / 3.2, D["z1"] + 0.34, 0.07, 0.05, 0.035, "fern" if j % 2 else "ivy", cuts=0)

    # --- the flowstone ramp down the front cliff (28 degrees: the game walks it smooth), ribbed like a
    # frozen cascade, rounded rock either side ---
    rsteps = 12
    run = (R["foot"] - R["top"]) / rsteps
    for i in range(rsteps):
        z0 = R["top"] + i * run
        y0 = D["y"] * (R["foot"] - z0) / (R["foot"] - R["top"])
        y1 = D["y"] * (R["foot"] - z0 - run) / (R["foot"] - R["top"])
        q = [rock.v(R["x0"], y0, z0), rock.v(R["x1"], y0, z0), rock.v(R["x1"], y1, z0 + run), rock.v(R["x0"], y1, z0 + run)]
        rock.face(list(reversed(q)), "flowstoneWarm" if i % 2 else "flowstone")
        # a rib of flowstone across it (a low lip, not a step)
        blob(rock, 0.0, (y0 + y1) / 2 + 0.01, z0 + run * 0.5, (R["x1"] - R["x0"]) * 0.5, 0.025, 0.08, "travertine", cuts=1)
    # its underside wall down to the floor on both sides
    for sx0, sx1 in ((R["x0"] - 0.3, R["x0"]), (R["x1"], R["x1"] + 0.3)):
        for i in range(rsteps):
            z0 = R["top"] + i * run
            yt = D["y"] * (R["foot"] - z0) / (R["foot"] - R["top"]) + 0.28
            box(rock, sx0, sx1, 0.0, max(0.3, yt), z0, z0 + run, "flowstone", bottom=False)
        for k in range(6):
            t = (k + 0.5) / 6
            z = R["top"] + (R["foot"] - R["top"]) * t
            yt = D["y"] * (R["foot"] - z) / (R["foot"] - R["top"])
            blob(rock, (sx0 + sx1) / 2, yt + 0.22, z, 0.22, 0.14, 0.42, "limestone", cuts=1, noise=0.25, seed=70 + k)

    # --- the shell: the north and west walls, double sided, a jagged skyline (lower and broken over
    # the doline, where the ceiling fell in), strata, the adit's mouth open in the north wall ---
    A = L["adit"]
    height = L["walls"]["height"]

    def wall(axis):
        n_along, n_up = 64, 14
        grid = []
        for i in range(n_along + 1):
            t = -half + 2 * half * i / n_along
            dol = smooth(13.5, 9.0, abs(t)) if axis == "n" else 0.0
            skyline = height - 3.2 * dol + 1.3 * fbm(t * 0.3, 3.0, 0.0, 21 if axis == "n" else 23) + 0.5 * math.sin(t * 0.7)
            floor_here = plateau_y(L, t, -half) if (axis == "n" and D["x0"] <= t <= D["x1"]) else 0.0
            column = []
            for j in range(n_up + 1):
                u = j / n_up
                y = -2.6 + (skyline + 2.6) * u
                depth = 0.14 + 0.28 * fbm(t * 0.6, y * 0.6, 5.0 if axis == "n" else 9.0, 31) + 0.1 * math.sin(y * 1.9 + t)
                depth *= smooth(floor_here - 0.2, floor_here + 0.8, y)
                inner = -half + 0.7 - depth
                v = shell.v(t, y, inner) if axis == "n" else shell.v(inner, y, t)
                shell.setv(v, wall_col(axis, t, y, floor_here, dol))
                column.append(v)
            grid.append(column)
        for i in range(n_along):
            t = -half + 2 * half * (i + 0.5) / n_along
            dol = smooth(13.5, 9.0, abs(t)) if axis == "n" else 0.0
            floor_here = plateau_y(L, t, -half) if (axis == "n" and D["x0"] <= t <= D["x1"]) else 0.0
            for j in range(n_up):
                a, b = grid[i][j], grid[i + 1][j]
                y = (a.co.z + grid[i][j + 1].co.z) / 2
                if axis == "n" and A["x"] - A["w"] / 2 - 0.05 < t < A["x"] + A["w"] / 2 + 0.05 and D["y"] - 0.1 < y < D["y"] + A["h"] + 0.2:
                    continue
                c2, d2 = grid[i + 1][j + 1], grid[i][j + 1]
                shell.setsmooth(shell.face((a, b, c2, d2) if axis == "n" else (b, a, d2, c2), wall_col(axis, t, y, floor_here, dol)))
        # the skyline's cap, and ferns and roots spilling over the doline's broken rim
        for i in range(n_along):
            a, b = grid[i][-1], grid[i + 1][-1]
            off = Vector((0, 1.1, 0)) if axis == "n" else Vector((-1.1, 0, 0))
            shell.face((a, b, shell.bm.verts.new(b.co + off), shell.bm.verts.new(a.co + off)), "mossA" if (axis == "n" and abs(-half + 2 * half * (i + 0.5) / n_along) < 11) else "shellDark")

    def wall_col(axis, t, y, floor_here, dol):
        base = lin(C["shell"])
        strata = 0.08 * math.sin(y * 2.7 + fbm(t, y, 1, 8) * 2.0)
        c = [base[m] * (1 + strata) for m in range(3)]
        # the sunlit doline wall: warm limestone, ivy and moss up to the broken rim
        if dol > 0:
            w = lin(C["limestone"])
            c = [c[m] + (w[m] - c[m]) * dol for m in range(3)]
            if fbm(t * 0.7, y * 0.45, 4.0, 19) > 0.05 and y > floor_here + 0.8:
                iv = lin(C["ivy"])
                c = [c[m] * 0.35 + iv[m] * 0.65 * dol + c[m] * 0.65 * (1 - dol) for m in range(3)]
        # the basalt fissure round the forge
        F = L["forge"]
        if axis == "n" and abs(t - F["x"]) < F["w"] / 2 + 1.0 and y < floor_here + F["h"] + 2.2:
            k = smooth(F["w"] / 2 + 1.0, F["w"] / 2 + 0.2, abs(t - F["x"]))
            bs = lin(C["basalt"])
            c = [c[m] + (bs[m] - c[m]) * k for m in range(3)]
        # the fissure wings: cold wet stone
        if (axis == "n" and abs(t) > 13) or axis == "w":
            cold = lin(C["shellCold"])
            k = smooth(12.0, 15.0, abs(t)) if axis == "n" else 1.0
            c = [c[m] + (cold[m] - c[m]) * k * 0.7 for m in range(3)]
        # the west wall behind the terraces: travertine, where the warm spring runs down
        if axis == "w" and T["pools"][0]["z0"] - 1.0 < t < T["pools"][-1]["z1"] + 1.0 and y < 3.4:
            tv = lin(C["travertine"])
            k = smooth(3.4, 1.6, y)
            c = [c[m] + (tv[m] - c[m]) * k * 0.8 for m in range(3)]
        return tuple(max(0.0, v) for v in c)

    wall("n")
    wall("w")
    # stalactites hugging the walls' upper reaches (the ceiling fell in over the doline: none there)
    for k in range(46):
        if k % 2:
            t = -half + 1.0 + (2 * half - 2.0) * rng.random()
            if abs(t) < 12.0:
                continue
            sx, sz = t, -half + 0.9 + 0.5 * rng.random()
        else:
            t = -half + 1.0 + (2 * half - 2.0) * rng.random()
            sx, sz = -half + 0.9 + 0.5 * rng.random(), t
        top = height - 1.4 - 1.2 * rng.random()
        ln = 0.7 + 1.6 * rng.random()
        cone(rock, (sx, top, sz), (sx + 0.03, top - ln, sz), 0.16 + 0.1 * ln, "limestoneDark", sides=6)
        if rng.random() < 0.35:
            blob(glow, sx + 0.03, top - ln - 0.02, sz, 0.02, 0.03, 0.02, "cyanSoft", cuts=0)

    # --- the adit's tunnel into the north wall: a dark recess, timbers round its mouth, a lantern ---
    ax0, ax1 = A["x"] - A["w"] / 2, A["x"] + A["w"] / 2
    dy = D["y"]
    box(rock, ax0 - 0.1, ax1 + 0.1, dy - 0.02, dy + A["h"] + 0.1, -half - 1.8, -half + 0.7, "tunnel", bottom=False)
    for sx in (ax0 - 0.14, ax1 + 0.14):
        box(rock, sx - 0.13, sx + 0.13, dy, dy + A["h"] + 0.15, -half + 0.45, -half + 0.72, "timber")
    box(rock, ax0 - 0.4, ax1 + 0.4, dy + A["h"], dy + A["h"] + 0.28, -half + 0.4, -half + 0.78, "timberDark")
    for k in range(5):
        z = -half - 1.4 + k * 0.5
        box(rock, ax0 + 0.1, ax1 - 0.1, dy + 0.01, dy + 0.05, z, z + 0.14, "timberDark", bottom=False)
    lathe(glow, ax1 + 0.4, -half + 1.0, [(0, 0), (0.07, 0.02), (0.09, 0.12), (0.07, 0.22), (0, 0.24)], "lanternHot", segs=8, y0=dy + 1.9)
    cyl(rock, (ax1 + 0.14, dy + 2.2, -half + 0.72), (ax1 + 0.4, dy + 2.2, -half + 1.0), 0.015, "iron", sides=5)

    # --- the Expedition Outpost: Gus's log workstation, the forge in its basalt fissure, the
    # meteorite anvil beside the antique tool crate, the camp's bits and pieces ---
    Wk = L["workstation"]
    wy = plateau_y(L, Wk["x"], Wk["z"])
    # a split log laid on two stumps, its flat face up
    for sx in (-1, 1):
        cyl(rock, (Wk["x"] + sx * Wk["len"] * 0.36, wy - 0.02, Wk["z"]), (Wk["x"] + sx * Wk["len"] * 0.36, wy + Wk["top"] - 0.16, Wk["z"]), 0.22, "timberDark", sides=9)
    cyl(rock, (Wk["x"] - Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), (Wk["x"] + Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), Wk["w"] * 0.5, "timber", sides=9)
    box(rock, Wk["x"] - Wk["len"] / 2 + 0.05, Wk["x"] + Wk["len"] / 2 - 0.05, wy + Wk["top"] - 0.12, wy + Wk["top"], Wk["z"] - Wk["w"] * 0.42, Wk["z"] + Wk["w"] * 0.42, "plank", bottom=False)
    # on it: a lantern, a hammer, a few ores and gems in a tray, a rolled map
    lathe(glow, Wk["x"] + 0.85, Wk["z"] - 0.1, [(0, 0), (0.07, 0.02), (0.08, 0.12), (0.06, 0.2), (0, 0.22)], "lanternHot", segs=8, y0=wy + Wk["top"])
    box(rock, Wk["x"] - 0.5, Wk["x"] - 0.05, wy + Wk["top"], wy + Wk["top"] + 0.05, Wk["z"] - 0.15, Wk["z"] + 0.12, "timberDark")
    for k, colr in enumerate(("copperNug", "silverVein", "coalChunk", "copperNug")):
        blob(rock, Wk["x"] - 0.42 + k * 0.1, wy + Wk["top"] + 0.08, Wk["z"] - 0.02, 0.04, 0.035, 0.04, colr, cuts=0)
    for k, g in enumerate(("gemRed", "cyan", "violet")):
        blob(glow, Wk["x"] - 0.4 + k * 0.12, wy + Wk["top"] + 0.1, Wk["z"] + 0.08, 0.03, 0.035, 0.03, g, cuts=0)
    cyl(rock, (Wk["x"] + 0.1, wy + Wk["top"] + 0.04, Wk["z"] + 0.18), (Wk["x"] + 0.55, wy + Wk["top"] + 0.04, Wk["z"] + 0.18), 0.04, "cloth", sides=6)
    # the camp behind him: a bedroll, crates, a coil of rope, a pick leaning on a sack
    box(rock, Wk["x"] - 2.6, Wk["x"] - 1.7, wy, wy + 0.5, Wk["z"] - 1.9, Wk["z"] - 1.3, "timber")
    box(rock, Wk["x"] - 2.5, Wk["x"] - 1.9, wy + 0.5, wy + 0.85, Wk["z"] - 1.85, Wk["z"] - 1.4, "timberDark")
    cyl(rock, (Wk["x"] + 1.5, wy + 0.12, Wk["z"] - 1.6), (Wk["x"] + 2.6, wy + 0.12, Wk["z"] - 1.6), 0.16, "redCloth", sides=8)
    blob(rock, Wk["x"] + 1.9, wy + 0.25, Wk["z"] - 0.9, 0.3, 0.3, 0.25, "sack", cuts=1)
    lathe(rock, Wk["x"] - 1.9, Wk["z"] - 0.6, [(0, 0), (0.24, 0.0), (0.24, 0.1), (0.1, 0.12), (0, 0.12)], "cloth", segs=10, y0=wy)
    # the forge: a stone hearth set into the basalt fissure, its glowing mouth, bellows of leather and
    # oak, a chimney crack glowing up the rock, columns of basalt either side
    F = L["forge"]
    fy = plateau_y(L, F["x"], F["z"])
    fx0, fx1 = F["x"] - F["w"] / 2, F["x"] + F["w"] / 2
    fz0, fz1 = F["z"] - F["d"] / 2, F["z"] + F["d"] / 2
    for k in range(9):
        cx = fx0 - 0.9 + (F["w"] + 1.8) * k / 8
        if fx0 + 0.3 < cx < fx1 - 0.3:
            continue
        hcol = F["h"] + 0.8 + 1.4 * rng.random()
        prism_col(rock, (cx, fy - 0.1, -half + 0.85 + 0.2 * rng.random()), 0.28 + 0.08 * rng.random(), hcol, "basalt" if k % 2 else "basaltLight")
    box(rock, fx0, fx1, fy, fy + F["h"], fz0 - 0.4, fz1, "stoneDark", top="basaltLight")
    box(rock, fx0 + 0.2, fx1 - 0.2, fy + F["h"], fy + F["h"] + 0.35, fz0, fz1 - 0.2, "basalt")
    # the mouth: an arch of fire bricks round the glow
    box(glow, F["x"] - 0.6, F["x"] + 0.6, fy + 0.45, fy + 1.25, fz1 - 0.02, fz1 + 0.01, "forgeMouth")
    blob(glow, F["x"], fy + 0.7, fz1 - 0.02, 0.45, 0.22, 0.06, "forgeCore", cuts=1)
    for k in range(7):
        a = math.pi * k / 6
        blob(rock, F["x"] + math.cos(a) * 0.72, fy + 0.85 + math.sin(a) * 0.55, fz1 + 0.04, 0.12, 0.1, 0.08, "brick", cuts=0)
    # the chimney crack up the rock, embers glowing in it
    for k in range(6):
        blob(glow, F["x"] + 0.12 * math.sin(k * 1.7), fy + F["h"] + 0.4 + k * 0.45, -half + 0.72, 0.06, 0.2, 0.04, "ember", cuts=0)
    # the bellows beside it, the quench trough, the coal heap
    bx_ = fx1 + 0.55
    box(rock, bx_ - 0.35, bx_ + 0.35, fy + 0.3, fy + 0.42, F["z"] + 0.1, F["z"] + 0.8, "timber")
    box(rock, bx_ - 0.32, bx_ + 0.32, fy + 0.42, fy + 0.62, F["z"] + 0.15, F["z"] + 0.75, "leather")
    box(rock, bx_ - 0.35, bx_ + 0.35, fy + 0.62, fy + 0.72, F["z"] + 0.1, F["z"] + 0.8, "timber")
    cyl(rock, (bx_ - 0.36, fy + 0.5, F["z"] + 0.45), (fx1 - 0.02, fy + 0.5, F["z"] + 0.45), 0.05, "iron", sides=6)
    cyl(rock, (bx_, fy, F["z"] + 0.1), (bx_, fy + 0.3, F["z"] + 0.1), 0.05, "timberDark", sides=5)
    box(rock, fx0 - 1.1, fx0 - 0.25, fy, fy + 0.4, F["z"] + 0.2, F["z"] + 0.75, "stoneDark", top="waterDark")
    for k in range(9):
        blob(rock, fx0 - 0.9 + 0.5 * rng.random(), fy + 0.08 + 0.1 * rng.random(), fz1 + 0.35 + 0.4 * rng.random(), 0.14, 0.1, 0.12, "coalChunk", cuts=0)
    # the meteorite anvil: a dark pitted iron-nickel lump, its top ground flat, on a rough stump
    An = L["anvil"]
    ay = plateau_y(L, An["x"], An["z"])
    cyl(rock, (An["x"], ay - 0.02, An["z"]), (An["x"], ay + 0.36, An["z"]), 0.3, "timberDark", sides=9, r_end=0.26)
    blob(rock, An["x"], ay + 0.56, An["z"], 0.34, 0.22, 0.28, "meteorite", cuts=2, noise=0.25, seed=5)
    box(rock, An["x"] - 0.24, An["x"] + 0.24, ay + 0.7, ay + 0.76, An["z"] - 0.16, An["z"] + 0.16, "steel")
    for k in range(5):
        a = rng.random() * 6.28
        blob(glow, An["x"] + math.cos(a) * 0.3, ay + 0.5 + 0.12 * rng.random(), An["z"] + math.sin(a) * 0.24, 0.025, 0.02, 0.025, "violetSoft", cuts=0)
    # the antique tool crate: iron-strapped, chisels and a mallet poking out
    Cr = L["crate"]
    cy_ = plateau_y(L, Cr["x"], Cr["z"])
    box(rock, Cr["x"] - Cr["w"] / 2, Cr["x"] + Cr["w"] / 2, cy_, cy_ + Cr["h"], Cr["z"] - Cr["d"] / 2, Cr["z"] + Cr["d"] / 2, "timber", top="timberDark")
    for sx in (-0.3, 0.3):
        box(rock, Cr["x"] + sx - 0.03, Cr["x"] + sx + 0.03, cy_, cy_ + Cr["h"] + 0.005, Cr["z"] - Cr["d"] / 2 - 0.005, Cr["z"] + Cr["d"] / 2 + 0.005, "iron")
    for k in range(4):
        cyl(rock, (Cr["x"] - 0.25 + k * 0.14, cy_ + Cr["h"] - 0.1, Cr["z"] - 0.05), (Cr["x"] - 0.2 + k * 0.14, cy_ + Cr["h"] + 0.22, Cr["z"] - 0.1 + 0.05 * k), 0.022, "steel" if k % 2 else "timberDark", sides=5)

    # --- the doline's life: ferns in the shade of the boulders, the fallen limestone, sun-warmed moss ---
    for x, z, r in L["boulders"]:
        fy_ = plateau_y(L, x, z) if in_doline(L, x, z) else ground_y(L, x, z)
        blob(rock, x, fy_ + r * 0.45, z, r * 1.05, r * 0.72, r * 0.95, "limestone", cuts=2, noise=0.3, seed=int(x * 10 + z), bottom=fy_ - 0.2)
        if in_doline(L, x, z):
            blob(rock, x, fy_ + r * 1.1, z, r * 0.7, r * 0.12, r * 0.6, "mossA", cuts=1, noise=0.3, seed=int(z * 7))
    for k in range(55):
        x = D["x0"] + 0.8 + (D["x1"] - D["x0"] - 1.6) * rng.random()
        z = D["z0"] + 1.4 + (D["z1"] - D["z0"] - 2.0) * rng.random()
        if abs(x + 0.35 * math.sin(z * 0.45)) < 1.6 or math.hypot(x - Wk["x"], z - Wk["z"]) < 2.8 or math.hypot(x - F["x"], z - F["z"]) < 2.8 or math.hypot(x - An["x"], z - An["z"]) < 1.8:
            continue
        if any(math.hypot(x - n["x"], z - n["z"]) < 1.4 for n in L["nodes"]):
            continue
        fern(rock, x, plateau_y(L, x, z), z, 0.35 + 0.35 * rng.random(), rng)

    # --- the fissures' fins, the nodes' fallen rock, the crystals and the glowing mushrooms ---
    for x, z, rx, rz, h, yaw in L["fins"]:
        ca, sa = math.cos(yaw), math.sin(yaw)
        for k in range(3):
            t = (k - 1) * 0.55
            px = x + (ca * rx if rx >= rz else sa * rz) * t
            pz = z + (-sa * rx if rx >= rz else ca * rz) * t
            blob(rock, px, h * 0.45, pz, rx * (0.75 if rx >= rz else 1.0), h * (0.5 - 0.08 * abs(k - 1)), rz * (0.75 if rz > rx else 1.0), "slate" if k % 2 else "limestoneDark", cuts=2, noise=0.3, seed=int(x * 13 + k), bottom=-0.2)
    for n in L["nodes"]:
        back = node_back_rock(L, n)
        if back:
            bxx, bzz, br = back
            fy_ = plateau_y(L, bxx, bzz) if in_doline(L, bxx, bzz) else 0.0
            blob(rock, bxx, fy_ + br * 0.55, bzz, br * 1.05, br * 0.8, br, "limestone" if in_doline(L, bxx, bzz) else "limestoneDark", cuts=2, noise=0.3, seed=int(bxx * 17), bottom=fy_ - 0.2)
    for x, z, s in L["crystals"]:
        base_y = 0.0
        blob(rock, x, base_y + 0.1 * s, z, 0.4 * s, 0.18 * s, 0.4 * s, "slate", cuts=1, noise=0.3, seed=int(x * 3))
        for k in range(6):
            a = 2 * math.pi * k / 6 + rng.random() * 0.4
            lean = 0.25 + 0.5 * rng.random() if k else 0.05
            d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
            prism(glow, (x + math.cos(a) * 0.12 * s * (k > 0), base_y + 0.1 * s, z + math.sin(a) * 0.12 * s * (k > 0)), d, (0.06 + 0.04 * rng.random()) * s * (1.5 if k == 0 else 1), (0.45 + 0.45 * rng.random()) * s * (1.6 if k == 0 else 1), "cyan" if (k + int(x)) % 3 else "violet")
    # (decoration only, no collider: small clusters along the walls and at the fins' feet, where no one
    # walks, so the fissures glow all over)
    deco_rng = random.Random(77)
    spots = []
    for k in range(34):
        side = k % 3
        if side == 0:
            px, pz = -half + 0.75 + 0.2 * deco_rng.random(), -half + 1.5 + (2 * half - 3.0) * deco_rng.random()
            if T["pools"][0]["z0"] - 1.5 < pz < T["pools"][-1]["z1"] + 1.5:
                continue
        elif side == 1:
            px, pz = -half + 1.5 + (2 * half - 3.0) * deco_rng.random(), -half + 0.75 + 0.2 * deco_rng.random()
            if D["x0"] - 0.5 < px < D["x1"] + 0.5:
                continue
        else:
            fx_, fz_, frx, frz, fh, fyaw = L["fins"][k % len(L["fins"])]
            a = deco_rng.random() * 6.28
            px, pz = fx_ + math.cos(a) * (max(frx, frz) + 0.2), fz_ + math.sin(a) * (min(frx, frz) + 0.35)
        if any(math.hypot(px - n["x"], pz - n["z"]) < 1.5 for n in L["nodes"]):
            continue
        spots.append((px, pz, 0.45 + 0.35 * deco_rng.random(), k))
    for px, pz, sc, k in spots:
        if k % 2:
            for j in range(3):
                a = 2 * math.pi * j / 3 + deco_rng.random()
                prism(glow, (px + math.cos(a) * 0.08 * sc * (j > 0), 0.0, pz + math.sin(a) * 0.08 * sc * (j > 0)), (math.cos(a) * 0.3 * (j > 0), 1.0, math.sin(a) * 0.3 * (j > 0)), 0.05 * sc, (0.5 + 0.4 * deco_rng.random()) * sc, "cyan" if (k + j) % 3 else "violet", sides=5)
        else:
            for j in range(3):
                a = 2 * math.pi * j / 3 + deco_rng.random()
                hh = (0.18 + 0.2 * deco_rng.random()) * sc
                qx, qz = px + math.cos(a) * 0.12 * sc * (j > 0), pz + math.sin(a) * 0.12 * sc * (j > 0)
                cyl(rock, (qx, 0.0, qz), (qx, hh, qz), 0.022 * sc + 0.01, "shroomStem", sides=4, cap=False)
                lathe(glow, qx, qz, [(0, 0.0), (0.1 * sc, 0.0), (0, 0.06 * sc)], "shroomTeal" if (k + j) % 2 else "shroomPink", segs=6, y0=hh)
    for x, z, s in L["shrooms"]:
        for k in range(4):
            a = 2 * math.pi * k / 4 + rng.random()
            r_ = 0.18 * s * (k > 0)
            hh = (0.25 + 0.35 * rng.random()) * s
            px, pz = x + math.cos(a) * r_, z + math.sin(a) * r_
            cyl(rock, (px, 0.0, pz), (px, hh, pz), 0.03 * s, "shroomStem", sides=5)
            lathe(glow, px, pz, [(0, 0.0), (0.13 * s, 0.0), (0.1 * s, 0.05 * s), (0, 0.09 * s)], "shroomTeal" if (k + int(x)) % 2 else "shroomPink", segs=7, y0=hh)

    # --- the Travertine Thermal Terraces: three rimstone pools stepping down the west cliff, their
    # rounded travertine lips, flowstone curtains down their fronts, warm water spilling from one to
    # the next, the spring in the wall above; the seats' submerged ledges ---
    therm = Mesh("CV_ThermalWater")
    x0, x1 = T["x0"] + 0.3, T["x1"]
    pools = T["pools"]

    def rimstone(cx, cz, rx, rz, seed, n=22):
        """A rimstone pool's outline: a lobed, wobbling oval (no straight edge anywhere)."""
        out = []
        for k in range(n):
            a = 2 * math.pi * k / n
            w = 1 + 0.1 * math.sin(3 * a + seed) + 0.07 * math.sin(5 * a + 2 * seed) + 0.05 * vnoise(math.cos(a) * 2, math.sin(a) * 2, seed, 7)
            out.append((cx + math.cos(a) * rx * w, cz + math.sin(a) * rz * w))
        return out

    for pi, P in enumerate(pools):
        z0, z1, wy_ = P["z0"], P["z1"], P["y"]
        cx, cz = (x0 + x1) / 2 - 0.1, (z0 + z1) / 2
        rx, rz = (x1 - x0) / 2 + 0.05, (z1 - z0) / 2 + 0.08
        outline = rimstone(cx, cz, rx, rz, pi * 1.7 + 0.3)
        # the basin: a travertine mound up to the lip, its outer face draped in flowstone curtains
        # (the mound's top is the pool's floor, 0.38 m under the water; the lip rises round it)
        slab(rock, outline, 0.0, wy_ - 0.38, "travertineShadow", top="travertine", bottom=False)
        # the rounded lip all round (organic travertine: no concrete edge), down to the floor inside
        for k, (px, pz) in enumerate(outline):
            if k % 2:
                continue
            blob(rock, px + (cx - px) * 0.06, wy_ - 0.12, pz + (cz - pz) * 0.06, 0.27, 0.25, 0.23, "travertine" if k % 4 else "flowstoneWarm", cuts=1, noise=0.18, seed=pi * 40 + k)
        for k in range(9):
            a = math.pi * (-0.45 + 0.9 * k / 8)
            px, pz = cx + math.cos(a) * (rx + 0.04), cz + math.sin(a) * (rz + 0.04)
            hh = wy_ + 0.02
            blob(rock, px, hh * 0.5, pz, 0.12, hh * 0.5 + 0.02, 0.16, "flowstone" if k % 2 else "travertineShadow", cuts=1, noise=0.2, seed=pi * 50 + k, bottom=0.0)
        # the water: warm and pale, just inside the lip
        wv = [therm.v(px, wy_, pz) for px, pz in rimstone(cx, cz, rx - 0.14, rz - 0.13, pi * 1.7 + 0.3)]
        mid = therm.v(cx, wy_, cz)
        for k in range(len(wv)):
            f = therm.face((mid, wv[(k + 1) % len(wv)], wv[k]), "thermalWater")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        # the cascade over its south lip into the next pool (a sheet of water, foam at its foot)
        if pi + 1 < len(pools):
            nxt = pools[pi + 1]
            for k in range(2):
                ccx = cx - 0.6 + 1.2 * k
                q = [therm.v(ccx - 0.28, wy_ + 0.02, cz + rz - 0.05), therm.v(ccx + 0.28, wy_ + 0.02, cz + rz - 0.05), therm.v(ccx + 0.32, nxt["y"] - 0.02, cz + rz + 0.3), therm.v(ccx - 0.32, nxt["y"] - 0.02, cz + rz + 0.3)]
                therm.face(q, "thermalWater")
                blob(rock, ccx, nxt["y"] + 0.02, cz + rz + 0.4, 0.3, 0.03, 0.14, "foam", cuts=1)
        # the seats' ledges under the water
        for st in L["thermalSeats"]:
            if z0 <= st["z"] <= z1:
                blob(rock, st["x"], wy_ + ledge_top - 0.12, st["z"], 0.34, 0.14, 0.32, "travertine", cuts=1, noise=0.15, seed=int(st["z"] * 10), bottom=wy_ - 0.38, top=wy_ + ledge_top)
    # the spring: a crack in the wall above the top pool, warm water running down its face
    sp_z = (pools[0]["z0"] + pools[0]["z1"]) / 2
    for k in range(6):
        blob(rock, -half + 0.8, pools[0]["y"] + 0.25 + k * 0.3, sp_z + 0.2 * math.sin(k), 0.14, 0.22, 0.26, "flowstoneWarm", cuts=1)
    q = [therm.v(-half + 0.95, pools[0]["y"] + 2.0, sp_z - 0.25), therm.v(-half + 0.95, pools[0]["y"] + 2.0, sp_z + 0.25), therm.v(-half + 1.05, pools[0]["y"] + 0.01, sp_z + 0.35), therm.v(-half + 1.05, pools[0]["y"] + 0.01, sp_z - 0.35)]
    therm.face(q, "thermalWater")

    # --- the Abyssal Cenote Lake: its water over the sand and the deep (the game's own shoreline), the
    # islet's rocks, the mangrove roots weeping down from its skylight, Finnegan's driftwood outcrop ---
    water = Mesh("CV_Water")
    wcell = 0.75
    wx0, wx1 = K["x"] - K["rx"] * 1.25, K["x"] + K["rx"] * 1.25
    wz0, wz1 = K["z"] - K["rz"] * 1.25, K["z"] + K["rz"] * 1.25
    nx_ = int((wx1 - wx0) / wcell)
    nz_ = int((wz1 - wz0) / wcell)
    wverts = {}

    def wv(i, k):
        if (i, k) not in wverts:
            x = wx0 + (wx1 - wx0) * i / nx_
            z = wz0 + (wz1 - wz0) * k / nz_
            v = water.v(x, K["water"], z)
            depth = K["water"] - ground_y(L, x, z)
            s0, s1, s2 = lin(C["aquaShallow"]), lin(C["aqua"]), lin(C["aquaDeep"])
            k1 = smooth(0.05, 0.8, depth)
            k2 = smooth(0.8, 2.0, depth)
            c = tuple(s0[m] + (s1[m] - s0[m]) * k1 + (s2[m] - s1[m]) * k2 for m in range(3))
            water.setv(v, c)
            wverts[(i, k)] = v
        return wverts[(i, k)]

    for i in range(nx_):
        for k in range(nz_):
            corners = [(wx0 + (wx1 - wx0) * (i + di) / nx_, wz0 + (wz1 - wz0) * (k + dk) / nz_) for di, dk in ((0, 0), (1, 0), (0, 1), (1, 1))]
            # (a cell anywhere the water shows: the sand over the rest hides it)
            if min(ground_y(L, x, z) for x, z in corners) > K["water"] + 0.02:
                continue
            q = [wv(i, k), wv(i, k + 1), wv(i + 1, k + 1), wv(i + 1, k)]
            water.setsmooth(water.face(q, "aqua"))
    # the islet's limestone boulders round its shore, moss and ferns on top
    for k in range(14):
        a = 2 * math.pi * k / 14 + rng.random() * 0.3
        rr = I["r"] * (0.95 + 0.1 * rng.random())
        px, pz = I["x"] + math.cos(a) * rr * (1 + 0.12 * math.sin(3 * a + 1.0)), I["z"] + math.sin(a) * rr * (1 + 0.12 * math.sin(3 * a + 1.0))
        if sandbar_distance(L, px, pz) < L["sandbar"]["half"] + 0.4:
            continue
        blob(rock, px, 0.05, pz, 0.35 + 0.2 * rng.random(), 0.3 + 0.2 * rng.random(), 0.32, "limestone", cuts=1, noise=0.3, seed=200 + k, bottom=-0.6)
    for k in range(9):
        a = rng.random() * 6.28
        rr = I["r"] * (0.3 + 0.35 * rng.random())
        px, pz = I["x"] + math.cos(a) * rr, I["z"] + math.sin(a) * rr
        if math.hypot(px - I["x"], pz - I["z"]) < 1.35:
            continue
        fern(rock, px, I["top"], pz, 0.3 + 0.2 * rng.random(), rng)
    # the karst tower on the islet's west shore (away from the camera): a stack of limestone topped by
    # an old mangrove, its aerial roots weeping down round the stack into the islet and the water, lit
    # by the skylight's beam far overhead
    Tw = L["tower"]
    tx, tz = Tw["x"], Tw["z"]
    tower_h = Tw["h"]
    for k in range(6):
        y = tower_h * k / 6
        w = 0.95 - 0.25 * math.sin(k / 5 * math.pi) + 0.1 * (k == 5)
        blob(roots, tx + 0.1 * math.sin(k * 1.3), y + 0.55, tz + 0.1 * math.cos(k * 1.7), w, 0.7, w * 0.9, "limestone" if k % 2 else "limestoneDark", cuts=2, noise=0.25, seed=600 + k)
    blob(roots, tx, tower_h + 0.35, tz, 1.25, 0.35, 1.1, "limestone", cuts=2, noise=0.3, seed=611)
    blob(roots, tx, tower_h + 0.6, tz, 1.15, 0.2, 1.0, "mossA", cuts=2, noise=0.3, seed=612)
    # the mangrove: a gnarled trunk, a round leafy crown
    cyl(roots, (tx, tower_h + 0.5, tz), (tx + 0.2, tower_h + 1.6, tz - 0.1), 0.18, "rootDark", sides=7, r_end=0.12)
    for k, (dx, dy, dz, r) in enumerate([(0.2, 2.1, -0.1, 1.0), (0.8, 1.8, 0.3, 0.7), (-0.6, 1.9, -0.4, 0.75), (0.1, 2.5, 0.4, 0.6)]):
        blob(roots, tx + dx, tower_h + dy, tz + dz, r, r * 0.7, r, "fern" if k % 2 else "mossB", cuts=2, noise=0.2, seed=620 + k)
    # its aerial roots: from the crown's rim down round the tower to the rock and the water
    for k in range(18):
        a = math.radians(-60 + 300 * k / 17 + 8 * rng.random())
        rr = 1.05 + 0.35 * rng.random()
        top = (tx + math.cos(a) * rr, tower_h + 0.4, tz + math.sin(a) * rr)
        foot_r = rr + 0.2 + 0.5 * rng.random()
        fx, fz = tx + math.cos(a) * foot_r, tz + math.sin(a) * foot_r
        end_y = (I["top"] if islet_factor(L, fx, fz) < 0.9 else K["water"] - 0.05) + (0.0 if rng.random() < 0.7 else 0.8 + 1.2 * rng.random())
        mid = (top[0] + (fx - top[0]) * 0.4, (top[1] + end_y) / 2 + 0.3, top[2] + (fz - top[2]) * 0.4)
        r0 = 0.05 + 0.03 * rng.random()
        cyl(roots, top, mid, r0, "root", sides=5, cap=False)
        cyl(roots, mid, (fx, end_y, fz), r0 * 0.8, "rootDark", sides=5, r_end=r0 * 0.35, cap=False)
    # Finnegan's driftwood outcrop: weathered planks on posts out over the water, a log along its
    # north side, driftwood heaped where it meets the beach
    Oc = L["outcrop"]
    dk = Oc["deck"]
    nplank = int((Oc["x1"] - Oc["x0"]) / 0.32)
    for k in range(nplank):
        px0 = Oc["x0"] + k * 0.32
        wob = 0.12 * math.sin(k * 1.9)
        box(rock, px0 + 0.01, px0 + 0.3, dk - 0.06, dk, Oc["z0"] - wob * 0.5, Oc["z1"] + wob, "driftwood" if k % 3 else "driftwoodDark", bottom=False)
    for px_ in (Oc["x0"] + 0.2, (Oc["x0"] + Oc["x1"]) / 2, Oc["x1"] - 0.4):
        for pz_ in (Oc["z0"] + 0.15, Oc["z1"] - 0.15):
            cyl(rock, (px_, -1.2, pz_), (px_, dk - 0.05, pz_), 0.09, "driftwoodDark", sides=6)
    cyl(rock, (Oc["x0"] - 0.1, dk + 0.08, Oc["z0"] - 0.12), (Oc["x1"] + 0.4, dk + 0.12, Oc["z0"] - 0.1), 0.13, "driftwood", sides=8)
    for k in range(5):
        a = rng.random() * 3.14
        px_, pz_ = Oc["x1"] + 0.3 + 0.8 * rng.random(), Oc["z0"] + (Oc["z1"] - Oc["z0"]) * rng.random()
        cyl(rock, (px_ - 0.6 * math.cos(a), 0.08, pz_ - 0.6 * math.sin(a)), (px_ + 0.6 * math.cos(a), 0.1, pz_ + 0.6 * math.sin(a)), 0.08 + 0.05 * rng.random(), "driftwood", sides=6)
    # a lantern post at the outcrop's end, and a rope coil
    ex = Oc["x0"] + 0.15
    cyl(rock, (ex, dk, Oc["z1"] - 0.1), (ex, dk + 1.2, Oc["z1"] - 0.1), 0.05, "driftwoodDark", sides=6)
    lathe(glow, ex + 0.18, Oc["z1"] - 0.1, [(0, 0), (0.06, 0.02), (0.07, 0.1), (0.05, 0.17), (0, 0.19)], "lanternHot", segs=8, y0=dk + 0.85)
    lathe(rock, Oc["x1"] - 0.5, Oc["z1"] - 0.35, [(0, 0), (0.2, 0.0), (0.2, 0.08), (0.08, 0.09), (0, 0.09)], "cloth", segs=10, y0=dk)

    # --- the rims: a low lip of rounded rock along the south and east (the cut-away), the strata of the
    # ground's section down its faces, and the slab under it all ---
    for k in range(70):
        t = k / 69
        x, z = -half + 2 * half * t, half - 0.2
        blob(rock, x, 0.08, z + 0.05, 0.5 + 0.2 * rng.random(), 0.2 + 0.25 * rng.random(), 0.32, "limestoneDark", cuts=1, noise=0.25, seed=400 + k, bottom=-0.3)
    for k in range(70):
        t = k / 69
        z = -half + 2 * half * t
        top = plateau_y(L, half, z) if in_doline(L, half, z) else 0.0
        blob(rock, half - 0.2, top + 0.08, z, 0.32, 0.2 + 0.25 * rng.random(), 0.5 + 0.2 * rng.random(), "limestoneDark", cuts=1, noise=0.25, seed=500 + k, bottom=top - 0.3)
    for axis in ("s", "e"):
        prev = None
        for k in range(61):
            t = -half + 2 * half * k / 60
            x, z = (t, half) if axis == "s" else (half, t)
            top = ground_y(L, x - (0.1 if axis == "e" else 0), z - (0.1 if axis == "s" else 0))
            a_, b_ = rock.v(x, -3.2, z), rock.v(x, top, z)
            rock.setv(a_, "bedrock")
            rock.setv(b_, "strata")
            if prev:
                q = (prev[0], a_, b_, prev[1]) if axis == "s" else (a_, prev[0], prev[1], b_)
                rock.setsmooth(rock.face(q, "strata"))
            prev = (a_, b_)
    box(rock, -half, half, -3.3, -3.2, -half, half, "bedrock", top="bedrock")

    finish_object("Cave_Rock", rock, coll, mottle=0.1)
    finish_object("Cave_Shell", shell, coll, mottle=0.08)
    finish_object("Cave_Roots", roots, coll, mottle=0.1)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)


def frange(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * k / n for k in range(n + 1)]


def node_back_rock(L, n):
    """The fallen limestone a node away from the walls sits in (as shared/worlds/caverns.ts
    nodeBackRock): its centre and radius, or None."""
    wall = n["x"] <= L["walls"]["west"] + 1.3 or n["z"] <= L["walls"]["north"] + 1.3
    if wall or n["kind"] == "monolith" or not n.get("face"):
        return None
    fx, fz = n["face"]
    fl = math.hypot(fx, fz) or 1
    r = ORE_RADII[n["kind"]]
    return (n["x"] - fx / fl * (r + 0.45), n["z"] - fz / fl * (r + 0.45), r + 0.35)


def fern(M, x, y, z, s, rng):
    """A low-poly fern: a ring of arching fronds, each a bent strip."""
    n = 4 + int(rng.random() * 2)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.random() * 0.4
        ln = s * (0.8 + 0.4 * rng.random())
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for j in range(3):
            t = j / 2
            r_ = ln * t
            h = y + 0.02 + ln * 0.55 * math.sin(t * math.pi * 0.85)
            pts.append((x + ca * r_, h, z + sa * r_))
        for j in range(2):
            (ax, ay, az), (bx, by, bz) = pts[j], pts[j + 1]
            w0 = s * 0.13 * (1 - j / 2.4)
            w1 = s * 0.13 * (1 - (j + 1) / 2.4)
            q = [M.v(ax - sa * w0, ay, az + ca * w0), M.v(bx - sa * w1, by, bz + ca * w1), M.v(bx + sa * w1, by, bz - ca * w1), M.v(ax + sa * w0, ay, az - ca * w0)]
            f = M.face(q, "fernLight" if j == 1 else "fern")
            # (one face, turned up to the camera: the fronds are seen from above)
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()


def prism_col(M, base, r, h, col):
    """A column of basalt: a hexagonal prism standing from `base`, its top a little tilted."""
    bx, by, bz = base
    ring0 = [M.v(bx + r * math.cos(2 * math.pi * k / 6), by, bz + r * math.sin(2 * math.pi * k / 6)) for k in range(6)]
    ring1 = [M.v(bx + r * math.cos(2 * math.pi * k / 6), by + h + 0.08 * math.sin(k), bz + r * math.sin(2 * math.pi * k / 6)) for k in range(6)]
    for k in range(6):
        k1 = (k + 1) % 6
        M.face((ring0[k1], ring0[k], ring1[k], ring1[k1]), col)
    M.face(list(ring1), col)


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
    # a broken node's stump: dark, rough, cracked bedrock, a few shards round it
    rubble = Mesh("CV_OreRock")
    rng = random.Random(99)
    blob(rubble, 0.0, 0.1, 0.0, 0.34, 0.16, 0.3, "rubble", cuts=2, noise=0.35, seed=3, bottom=0.0, top=0.2)
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.random() * 0.4
        blob(rubble, 0.16 * math.cos(a), 0.19, 0.14 * math.sin(a), 0.1, 0.02, 0.018, "rubbleCrack", cuts=0)
    for k in range(6):
        a = rng.random() * 6.283
        rr = 0.3 + 0.18 * rng.random()
        blob(rubble, rr * math.cos(a), 0.04, rr * math.sin(a), 0.07 + 0.05 * rng.random(), 0.04 + 0.03 * rng.random(), 0.06 + 0.04 * rng.random(), "rubble", cuts=0, noise=0.2, seed=k, bottom=0.0)
    made.append(finish_object("Ore_Rubble", rubble, coll, bake=False, mottle=0.12))
    return made


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    LIGHTS.clear()
    L = read_layout(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    ORE_RADII.clear()
    ORE_RADII.update(read_ore_radii(root))
    build_cavern(L, coll, read_thermal_ledge(root))
    ores = build_ores(coll, ORE_RADII)
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
