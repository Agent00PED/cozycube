"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    npm run caverns-terrain
    blender -b --factory-startup -P scripts/blender/build_caverns.py

Nothing is placed by hand. Where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is), and the ground itself
from the very grid the game walks: scripts/blender/data/caverns_terrain.json (`npm run
caverns-terrain` writes it from caverns.ts; `npm run check-layout` fails while it is stale): a vertex
every 0.5 m with its height and what it is (loam, scree, sand, slate, travertine, the lake's bed, bare
rock), and the 0.25 m mask of where you can stand. A monumental 45 x 45 organic karst: no stairs, no
tabletop slabs, no rows of cones. The ground's walked parts are the grid exactly; its rock slopes,
away from any footing, are roughened. Stylised clay like the other worlds, every colour a vertex
colour and the light painted in (the sun down the doline, the forge's magma, the warm pools, the
cenote's heart, every crystal's and mushroom's glow). One mesh per finish:

    Cave_Rock       CV_Clay          the ground (the doline's mossy loam, the trails' scree, the
                                     overlook's limestone, the shelf's wet slate, the chasm's dark
                                     floor, the beach's sand sloping into the lake and its bed down to
                                     the deep), the tumbled boulders and the nodes' host rocks, the
                                     towering stalagmites, the chasm's fins, the Expedition Outpost
                                     (Gus's log workstation, the forge in its basalt fissure with its
                                     magma veins, the meteorite anvil on its low outcrop, the tool
                                     crate), the travertine terraces' rimstone dams, the islet's
                                     rocks, the section of the open rim
    Cave_Shell      CV_Shell         the cavern's north and west walls rising into the vault that
                                     arches in over the floor (broken open over the doline, where the
                                     sun comes in), its pockets and fissures, the stalactite clusters
                                     nested in them, double sided
    Cave_Glow       CV_Glow          what glows (the game lights it from its own vertex colours): the
                                     crystals, the mushrooms' caps, the lanterns, the forge's mouth,
                                     the magma veins, the gems on Gus's tray
    Cave_Water      CV_Water         the cenote's surface (transparent in the game, no depth write)
    Cave_Thermal    CV_ThermalWater  the terraces' warm water and its cascades (the same)
    Cave_Roots      CV_Occluder      the islet's karst tower, its mangrove and the aerial roots weeping
                                     down round the Monolith (dithered where they stand between you
                                     and the camera)
    caverns_walk_collider  CV_Collider  the walk surface: the grid's triangles exactly (never drawn:
                                     the game's click collider)

and the ore nodes' rocks, each at the origin (its pivot on its floor, its foot sunk into it), for the
game to place at every node of its kind, instanced: angular ore chunks with glowing mineral facets,
set into their host rock or the wall (never a ball dropped on the floor):

    Ore_<kind>      CV_OreRock + CV_OreGlow   coal, copper, iron, silver, glimmer, monolith
    Ore_Rubble      CV_OreRock                what a broken node leaves till it grows back: a dark,
                                              rough stump of cracked bedrock

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




def frange(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * k / n for k in range(n + 1)]


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
# the organic karst


C.update(
    {
        "scree": "#CBC0AA",
        "screeDark": "#AEA38F",
        "loamDark": "#58492F",
        "slateMoss": "#40583A",
        "chasmFloor": "#2B3143",
        "chasmMoss": "#2F6A68",
        "earthPacked": "#7C6649",
        "limestonePale": "#D2C9B3",
        "strataDark": "#5E554A",
        "vault": "#6A6258",
        "vaultDark": "#3A3531",
        "magma": "#FF5A1F",
        "magmaHot": "#FFC05A",
        "sectionDark": "#3C352E",
    }
)
FINISHES["CV_Collider"] = 1.0


def read_terrain(root):
    path = os.path.join(root, "scripts", "blender", "data", "caverns_terrain.json")
    return json.load(open(path, encoding="utf-8"))


class Ground:
    """The walk grid (shared/worlds/caverns.ts: TERRAIN_HEIGHTS, cavernsFloorY, the mask), as read."""

    def __init__(self, T):
        self.n, self.cell, self.x0 = T["n"], T["cell"], T["x0"]
        self.h, self.s = T["heights"], T["surface"]
        self.mn, self.mc, self.m = T["maskN"], T["maskCell"], T["mask"]
        self.pools = T["pools"]
        self.dist = self._walk_distance()

    def at(self, i, k):
        return self.x0 + i * self.cell, self.x0 + k * self.cell

    def y(self, x, z):
        """The floor's height: the grid split along each cell's (-x, -z) to (+x, +z) diagonal."""
        fx = min(max((x - self.x0) / self.cell, 0.0), self.n - 1.000001)
        fz = min(max((z - self.x0) / self.cell, 0.0), self.n - 1.000001)
        i, k = int(fx), int(fz)
        u, v = fx - i, fz - k
        n = self.n
        h00, h10, h01, h11 = self.h[k * n + i], self.h[k * n + i + 1], self.h[(k + 1) * n + i], self.h[(k + 1) * n + i + 1]
        return h00 + u * (h10 - h00) + v * (h11 - h10) if u >= v else h00 + v * (h01 - h00) + u * (h11 - h01)

    def walk(self, x, z):
        i, k = int((x - self.x0) / self.mc), int((z - self.x0) / self.mc)
        return 0 <= i < self.mn and 0 <= k < self.mn and self.m[k * self.mn + i] == "1"

    def _walk_distance(self):
        """Each grid vertex's distance (m) to the nearest cell you can stand in (a chamfer pass)."""
        N = self.mn
        INF = 1e9
        d = [0.0 if c == "1" else INF for c in self.m]
        r2 = 1.4142
        for k in range(N):
            for i in range(N):
                q = k * N + i
                if d[q] == 0.0:
                    continue
                b = d[q]
                if i > 0:
                    b = min(b, d[q - 1] + 1)
                if k > 0:
                    b = min(b, d[q - N] + 1)
                    if i > 0:
                        b = min(b, d[q - N - 1] + r2)
                    if i < N - 1:
                        b = min(b, d[q - N + 1] + r2)
                d[q] = b
        for k in range(N - 1, -1, -1):
            for i in range(N - 1, -1, -1):
                q = k * N + i
                b = d[q]
                if i < N - 1:
                    b = min(b, d[q + 1] + 1)
                if k < N - 1:
                    b = min(b, d[q + N] + 1)
                    if i < N - 1:
                        b = min(b, d[q + N + 1] + r2)
                    if i > 0:
                        b = min(b, d[q + N - 1] + r2)
                d[q] = b
        out = []
        for k in range(self.n):
            for i in range(self.n):
                best = INF
                for kk in (2 * k - 1, 2 * k):
                    for ii in (2 * i - 1, 2 * i):
                        if 0 <= ii < N and 0 <= kk < N:
                            best = min(best, d[kk * N + ii])
                out.append(best * self.mc)
        return out


def ambient_at(p):
    """The cavern's own light: the doline's sun-warmed air, the lake's cool aquamarine, the chasm's
    deep blue, the shelf's damp grey, dimmer up the walls (but where the sun falls down the doline)."""
    x, y, z = p
    # (the doline's sun spills down over the overlook; the open floor is lit cool by the cenote; only
    # the walls' feet and the chasm sink into the dark)
    doline = smooth(-2.5, -9.5, z) * (1 - smooth(12.0, 15.0, x)) * (1 - 0.5 * smooth(-12.0, -15.0, x))
    lakeside = 0.55 + 0.45 * smooth(16.0, 6.0, math.hypot((x - 1.0) / 1.3, z - 10.8))
    lakeside *= 1 - 0.5 * smooth(-17.0, -21.5, min(x, z))
    chasm = smooth(12.0, 16.0, x) * smooth(4.0, -2.0, z)
    warm = (0.9, 0.84, 0.7)
    cool = (0.6, 0.66, 0.7)
    dark = (0.36, 0.39, 0.5)
    deep = (0.3, 0.36, 0.56)
    base = tuple(dark[i] + (cool[i] - dark[i]) * lakeside for i in range(3))
    base = tuple(base[i] + (deep[i] - base[i]) * chasm for i in range(3))
    a = tuple(base[i] + (warm[i] - base[i]) * doline for i in range(3))
    fade = 1 - 0.45 * smooth(6.0, 12.0, y) * (1 - doline)
    return tuple(c * fade for c in a)


def mixc(a, b, t):
    ca = lin(a) if isinstance(a, str) else a
    cb = lin(b) if isinstance(b, str) else b
    t = max(0.0, min(1.0, t))
    return tuple(ca[i] + (cb[i] - ca[i]) * t for i in range(3))


def ground_colour(x, y, z, s, d):
    """A floor vertex's colour by what it is (the grid's surface), mottled, blended at the edges by
    the vertices' own colours."""
    n1 = fbm(x * 0.55, 0.3, z * 0.55, 11)
    n2 = fbm(x * 1.9, 0.7, z * 1.9, 13)
    if s == 0:  # bare rock: pale limestone and its strata, mossier where the doline's sun reaches
        band = 0.5 + 0.5 * math.sin(y * 6.5 + n1 * 3.0)
        c = mixc("limestone", "limestoneDark", band * 0.7)
        c = mixc(c, "strata", max(0.0, n2) * 0.45)
        if z < -9.0 and y > 2.6:
            c = mixc(c, "mossA", 0.35 + 0.3 * n2)
        return c
    if s == 1:  # the doline's mossy loam
        c = mixc("loam", "mossA", 0.45 + 0.45 * n1)
        return mixc(c, "mossB", max(0.0, n2) * 0.6)
    if s == 2:  # the trails' scree
        c = mixc("scree", "screeDark", 0.5 + 0.5 * n2)
        return mixc(c, "earthPacked", max(0.0, n1) * 0.4)
    if s == 3:  # sand, wet toward the water
        c = mixc("sand", "sandGold", 0.5 + 0.5 * n1)
        return mixc(c, "sandWet", smooth(0.25, -0.1, y))
    if s == 4:  # the shelf's wet slate, mossy seams
        c = mixc("slate", "slateWet", 0.5 + 0.5 * n1)
        return mixc(c, "slateMoss", max(0.0, n2) * 0.7)
    if s == 5:  # the chasm's dark floor, glow moss in its hollows
        c = mixc("chasmFloor", "slateWet", 0.5 + 0.5 * n1)
        return mixc(c, "chasmMoss", max(0.0, n2 - 0.15) * 0.9)
    if s == 6:  # travertine
        return mixc("travertine", "travertineShadow", 0.5 + 0.5 * n2)
    if s == 7:  # the lake's bed: sand to aquamarine to the deep
        c = mixc("sandWet", "bed", smooth(-0.1, -0.7, y))
        return mixc(c, "bedDeep", smooth(-0.8, -2.2, y))
    if s == 8:  # the overlook's pale limestone, cracked
        return mixc("limestonePale", "limestone", 0.5 + 0.5 * n2)
    # the low ground's packed earth, mossy
    c = mixc("earthPacked", "loam", 0.5 + 0.5 * n1)
    return mixc(c, "mossA", max(0.0, n2) * 0.45)


def pool_outline(G, pi, seed):
    """A rimstone pool's outline: a lobed, wobbling oval over its span of the terraces."""
    L = LAYOUT
    T = L["terraces"]
    P = L["terraces"]["pools"][pi]
    cx, cz = (T["x0"] + T["x1"]) / 2, (P["z0"] + P["z1"]) / 2
    rx, rz = (T["x1"] - T["x0"]) / 2, (P["z1"] - P["z0"]) / 2 + 0.1
    out = []
    for k in range(24):
        a = 2 * math.pi * k / 24
        w = 1 + 0.08 * math.sin(3 * a + seed) + 0.06 * math.sin(5 * a + 2 * seed) + 0.04 * vnoise(math.cos(a) * 2, math.sin(a) * 2, seed, 7)
        out.append((cx + math.cos(a) * rx * w, cz + math.sin(a) * rz * w))
    return (cx, cz, rx, rz), out


def inside_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        ax, az = poly[j]
        bx, bz = poly[i]
        if (bz > z) != (az > z) and x < (ax - bx) * (z - bz) / (az - bz) + bx:
            inside = not inside
        j = i
    return inside


LAYOUT = {}


def build_ground(G, L, rock, water):
    """The floor: the walk grid's very triangles, painted by what they are; the rock slopes away from
    any footing roughened; the terraces' pools carved into it; the lake's water over its bed."""
    n = G.n
    pools = [pool_outline(G, pi, pi * 1.7 + 0.3) for pi in range(len(G.pools))]
    # each vertex's colour by what it is, then blurred twice over its neighbours (so a sand shore, a
    # scree trail's edge or a moss patch fades into the next, never a staircase of cells)
    cols = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            q = k * n + i
            cols.append(ground_colour(x, G.h[q], z, G.s[q], G.dist[q]))
    for _ in range(1):
        nxt = []
        for k in range(n):
            for i in range(n):
                acc = [0.0, 0.0, 0.0]
                wsum = 0.0
                for dk in (-1, 0, 1):
                    for di in (-1, 0, 1):
                        ii, kk = i + di, k + dk
                        if 0 <= ii < n and 0 <= kk < n:
                            w = 2.0 if di == 0 and dk == 0 else 1.0
                            c = cols[kk * n + ii]
                            acc = [acc[j] + c[j] * w for j in range(3)]
                            wsum += w
                nxt.append(tuple(a / wsum for a in acc))
        cols = nxt
    verts = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            q = k * n + i
            h, d = G.h[q], G.dist[q]
            # the rock roughened by how steep it is (never where anyone stands: the flat stays flat)
            if d > 0.3:
                hx = G.h[k * n + min(n - 1, i + 1)] - G.h[k * n + max(0, i - 1)]
                hz = G.h[min(n - 1, k + 1) * n + i] - G.h[max(0, k - 1) * n + i]
                steep = math.hypot(hx, hz) / (2 * G.cell)
                h += smooth(0.35, 1.0, steep) * smooth(0.3, 0.9, d) * (0.3 * fbm(x * 0.8, 0.0, z * 0.8, 31) + 0.14 * fbm(x * 2.2, 1.0, z * 2.2, 37))
            for pi, ((cx, cz, rx, rz), out) in enumerate(pools):
                if inside_poly(x, z, out):
                    h = min(h, G.pools[pi]["y"] - 0.38)
            v = rock.v(x, h, z)
            rock.setv(v, cols[q])
            verts.append(v)
    for k in range(n - 1):
        for i in range(n - 1):
            a, b = verts[k * n + i], verts[k * n + i + 1]
            c, dv = verts[(k + 1) * n + i], verts[(k + 1) * n + i + 1]
            # (the game's diagonal: (-x, -z) to (+x, +z); wound to face up)
            for tri in ((a, dv, b), (a, c, dv)):
                f = rock.face(tri, ground_colour(0, 0, 0, 1, 0))
                rock.setsmooth(f)
    # the lake's surface over every cell its water shows in (the sand over the rest hides it)
    K = L["lake"]
    wy = K["water"]
    wv = {}

    def wvert(i, k):
        if (i, k) not in wv:
            x, z = G.at(i, k)
            depth = wy - G.h[k * n + i]
            v = water.v(x, wy, z)
            water.setv(v, mixc(mixc("aquaShallow", "aqua", smooth(0.1, 0.8, depth)), "aquaDeep", smooth(0.9, 2.2, depth)))
            wv[(i, k)] = v
        return wv[(i, k)]

    for k in range(n - 1):
        for i in range(n - 1):
            hs = [G.h[kk * n + ii] for ii, kk in ((i, k), (i + 1, k), (i, k + 1), (i + 1, k + 1))]
            x, z = G.at(i, k)
            if min(hs) > wy - 0.02 or math.hypot((x - K["x"]) / K["rx"], (z - K["z"]) / K["rz"]) > 1.35:
                continue
            q = [wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)]
            water.setsmooth(water.face(q, "aqua"))


def build_collider(G, coll):
    """The walk surface, triangle for triangle (never drawn: the game's click collider)."""
    bm = bmesh.new()
    n = G.n
    verts = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            verts.append(bm.verts.new(W(x, G.h[k * n + i], z)))
    for k in range(n - 1):
        for i in range(n - 1):
            a, b = verts[k * n + i], verts[k * n + i + 1]
            c, dv = verts[(k + 1) * n + i], verts[(k + 1) * n + i + 1]
            bm.faces.new((a, dv, b))
            bm.faces.new((a, c, dv))
    # (smooth: each vertex exported once, not once a triangle)
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new("caverns_walk_colliderMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material("CV_Collider"))
    ob = bpy.data.objects.new("caverns_walk_collider", me)
    coll.objects.link(ob)
    return ob


def wall_point(G, L, along, u, v, rng_seed):
    """A point on the shell: `along` "x" the north wall (u its x), "z" the west (u its z); v 0 at its
    foot on the ground, 1 at its top, curving in over the floor near the top into the vault (broken
    open over the doline, where the sun comes in); bulging in and out, pocketed."""
    half = L["half"]
    top = L["walls"]["height"]
    gx, gz = (u, -half + 0.4) if along == "x" else (-half + 0.4, u)
    foot = G.y(max(-half, min(half, gx)), max(-half, min(half, gz))) - 0.5
    y = foot + (top - foot) * v
    seed = 3.0 if along == "x" else 7.0
    bulge = 0.3 + 0.55 * (0.5 + 0.5 * fbm(u * 0.33, y * 0.33, seed, 41))
    pocket = max(0.0, fbm(u * 0.22, y * 0.28, seed + 1, 43) - 0.15) * 1.6
    broken = along == "x" and -9.0 < u < 11.0
    vault_depth = (1.0 + 0.6 * fbm(u * 0.4, 0.0, seed, 47)) if broken else (4.2 + 1.2 * fbm(u * 0.25, 0.0, seed, 49))
    vault = vault_depth * smooth(0.55, 1.0, v) ** 1.5
    inward = bulge - pocket * smooth(0.25, 0.5, v) * (1 - smooth(0.8, 0.95, v)) + vault
    if v < 0.22:
        inward = min(inward, 0.95)
    inward = max(inward, 0.05)
    if along == "x":
        return (u, y, -half + inward)
    return (-half + inward, y, u)


def wall_colour(x, y, z, v, along):
    n1 = fbm(x * 0.4, y * 0.8, z * 0.4, 51)
    band = 0.5 + 0.5 * math.sin(y * 4.2 + n1 * 2.5)
    c = mixc("shell", "strata", band * 0.7)
    c = mixc(c, "vaultDark", smooth(0.6, 1.0, v) * 0.55)
    # the shelf's damp slate and the chasm's cold blue in their stretch of wall, ivy under the doline's sun
    if (along == "z" and z < -8.0) or (along == "x" and x < -13.0):
        c = mixc(c, "slate", 0.55)
        c = mixc(c, "slateMoss", max(0.0, fbm(x * 1.3, y * 1.3, z * 1.3, 53)) * 0.8 * (1 - smooth(0.2, 0.5, v)))
    elif along == "x" and x > 13.0:
        c = mixc(c, "shellCold", 0.6)
    elif along == "x" and -10 < x < 12 and v < 0.55:
        c = mixc(c, "ivy", max(0.0, fbm(x * 1.1, y * 0.9, z, 55) - 0.05) * 0.9)
    return c


def build_shell(G, L, shell, glow, rock, rng):
    """The north and west walls, their vault, the adit's and the forge's openings, the stalactite
    clusters nested in the vault's pockets."""
    half = L["half"]
    A = L["adit"]
    F = L["forge"]
    V = 20
    us = frange(-half - 0.5, half, 0.55)
    for along in ("x", "z"):
        grid = []
        for u in us:
            col = []
            for j in range(V + 1):
                p = wall_point(G, L, along, u, j / V, 0)
                v = shell.v(*p)
                shell.setv(v, wall_colour(p[0], p[1], p[2], j / V, along))
                col.append(v)
            grid.append(col)
        for a in range(len(us) - 1):
            for j in range(V):
                u0, u1 = us[a], us[a + 1]
                y0 = grid[a][j].co.z
                if along == "x":
                    # (the adit's mouth and the forge's fissure open in the north wall)
                    if u1 > A["x"] - A["w"] / 2 - 0.25 and u0 < A["x"] + A["w"] / 2 + 0.25 and y0 < G.y(A["x"], -half + 1.0) + A["h"] + 0.3:
                        continue
                    if u1 > F["x"] - F["w"] / 2 - 0.2 and u0 < F["x"] + F["w"] / 2 + 0.2 and y0 < G.y(F["x"], F["z"]) + F["h"] + 0.9:
                        continue
                q = (grid[a][j], grid[a + 1][j], grid[a + 1][j + 1], grid[a][j + 1])
                shell.setsmooth(shell.face(q if along == "x" else tuple(reversed(q)), "shell"))
    # the stalactite clusters nested in the vault's pockets (never a row of them)
    spots = []
    for k in range(40):
        along = "x" if rng.random() < 0.55 else "z"
        u = -half + 2.0 + rng.random() * (2 * half - 4.0)
        if along == "x" and -9.5 < u < 11.5:
            continue
        spots.append((along, u))
        if len(spots) >= 9:
            break
    for along, u in spots:
        # a cluster of dripstone nested up under the vault in a pocket: lumpy, tapering, uneven
        n = 3 + int(rng.random() * 3)
        for c in range(n):
            du = (rng.random() - 0.5) * 1.4
            v = 0.6 + 0.12 * rng.random()
            p = wall_point(G, L, along, u + du, v, 0)
            back = 0.15 + rng.random() * 0.5
            bx, by, bz = (p[0], p[1], p[2] - back) if along == "x" else (p[0] - back, p[1], p[2])
            ln = 0.4 + rng.random() * 1.3
            r = 0.1 + 0.08 * rng.random() + 0.05 * ln
            segs = 2 + int(ln / 0.7)
            for j in range(segs):
                t = j / segs
                blob(shell, bx + 0.03 * math.sin(j + c), by - ln * t, bz + 0.03 * math.cos(j + c), r * (1 - 0.75 * t), ln / segs * 0.7, r * (1 - 0.75 * t), "flowstone" if (j + c) % 2 else "vault", cuts=0, noise=0.25, seed=c * 7 + j)
    # the adit: a dark tunnel into the north wall, timbers round its mouth, a lantern
    ax0, ax1 = A["x"] - A["w"] / 2, A["x"] + A["w"] / 2
    dy = G.y(A["x"], -half + 1.4)
    box(rock, ax0 - 0.12, ax1 + 0.12, dy - 0.3, dy + A["h"] + 0.1, -half - 2.2, -half + 0.6, "tunnel", bottom=False)
    for sx in (ax0 - 0.14, ax1 + 0.14):
        box(rock, sx - 0.13, sx + 0.13, dy - 0.2, dy + A["h"] + 0.15, -half + 0.35, -half + 0.62, "timber")
    box(rock, ax0 - 0.45, ax1 + 0.45, dy + A["h"], dy + A["h"] + 0.3, -half + 0.3, -half + 0.68, "timberDark")
    for k in range(5):
        z = -half - 1.8 + k * 0.5
        box(rock, ax0 + 0.1, ax1 - 0.1, dy + 0.01, dy + 0.05, z, z + 0.14, "timberDark", bottom=False)
    lathe(glow, ax1 + 0.42, -half + 0.95, [(0, 0), (0.07, 0.02), (0.09, 0.12), (0.07, 0.22), (0, 0.24)], "lanternHot", segs=8, y0=dy + 1.9)
    cyl(rock, (ax1 + 0.14, dy + 2.2, -half + 0.62), (ax1 + 0.42, dy + 2.2, -half + 0.95), 0.015, "iron", sides=5)
    # the rubble of the tunnel's mouth, heaped either side
    for k in range(6):
        sx = (ax0 - 0.7 - 0.5 * rng.random()) if k % 2 else (ax1 + 0.7 + 0.5 * rng.random())
        blob(rock, sx, dy + 0.1, -half + 0.9 + 0.4 * rng.random(), 0.3 + 0.2 * rng.random(), 0.22, 0.26, "limestoneDark", cuts=1, noise=0.25, seed=900 + k, bottom=dy - 0.2)


def build_outpost(G, L, rock, glow, rng):
    """Gus's log workstation, the forge in its basalt fissure (its magma veins), the meteorite anvil
    on its low rock outcrop, the antique tool crate."""
    half = L["half"]
    Wk = L["workstation"]
    wy = G.y(Wk["x"], Wk["z"])
    for sx in (-1, 1):
        cyl(rock, (Wk["x"] + sx * Wk["len"] * 0.36, wy - 0.05, Wk["z"]), (Wk["x"] + sx * Wk["len"] * 0.36, wy + Wk["top"] - 0.16, Wk["z"]), 0.22, "timberDark", sides=9)
    cyl(rock, (Wk["x"] - Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), (Wk["x"] + Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), Wk["w"] * 0.5, "timber", sides=9)
    box(rock, Wk["x"] - Wk["len"] / 2 + 0.05, Wk["x"] + Wk["len"] / 2 - 0.05, wy + Wk["top"] - 0.12, wy + Wk["top"], Wk["z"] - Wk["w"] * 0.42, Wk["z"] + Wk["w"] * 0.42, "plank", bottom=False)
    lathe(glow, Wk["x"] + 0.85, Wk["z"] - 0.1, [(0, 0), (0.07, 0.02), (0.08, 0.12), (0.06, 0.2), (0, 0.22)], "lanternHot", segs=8, y0=wy + Wk["top"])
    box(rock, Wk["x"] - 0.5, Wk["x"] - 0.05, wy + Wk["top"], wy + Wk["top"] + 0.05, Wk["z"] - 0.15, Wk["z"] + 0.12, "timberDark")
    for k, colr in enumerate(("copperNug", "silverVein", "coalChunk", "copperNug")):
        blob(rock, Wk["x"] - 0.42 + k * 0.1, wy + Wk["top"] + 0.08, Wk["z"] - 0.02, 0.04, 0.035, 0.04, colr, cuts=0)
    for k, g in enumerate(("gemRed", "cyan", "violet")):
        blob(glow, Wk["x"] - 0.4 + k * 0.12, wy + Wk["top"] + 0.1, Wk["z"] + 0.08, 0.03, 0.035, 0.03, g, cuts=0)
    cyl(rock, (Wk["x"] + 0.1, wy + Wk["top"] + 0.04, Wk["z"] + 0.18), (Wk["x"] + 0.55, wy + Wk["top"] + 0.04, Wk["z"] + 0.18), 0.04, "cloth", sides=6)
    # the camp behind him: crates, a bedroll, a sack
    box(rock, Wk["x"] - 2.6, Wk["x"] - 1.7, wy - 0.05, wy + 0.5, Wk["z"] - 1.9, Wk["z"] - 1.3, "timber")
    box(rock, Wk["x"] - 2.5, Wk["x"] - 1.9, wy + 0.5, wy + 0.85, Wk["z"] - 1.85, Wk["z"] - 1.4, "timberDark")
    cyl(rock, (Wk["x"] + 1.5, wy + 0.12, Wk["z"] - 1.6), (Wk["x"] + 2.6, wy + 0.12, Wk["z"] - 1.6), 0.16, "redCloth", sides=8)
    blob(rock, Wk["x"] + 1.9, wy + 0.25, Wk["z"] - 0.9, 0.3, 0.3, 0.25, "sack", cuts=1)
    # the forge: a hearth set into the basalt fissure of the north wall, columns of basalt lining it,
    # magma veins glowing up its back, its mouth, the bellows, the quench trough, the coal heap
    F = L["forge"]
    fy = G.y(F["x"], F["z"] + F["d"] / 2 + 0.3)
    fx0, fx1 = F["x"] - F["w"] / 2, F["x"] + F["w"] / 2
    fz0, fz1 = F["z"] - F["d"] / 2, F["z"] + F["d"] / 2
    for k in range(12):
        cx = fx0 - 0.6 + (F["w"] + 1.2) * k / 11
        back = -half + 0.2 + 0.25 * rng.random()
        if fx0 + 0.25 < cx < fx1 - 0.25:
            prism_col(rock, (cx, fy - 0.2, back - 0.35), 0.26 + 0.06 * rng.random(), F["h"] + 1.4 + 1.2 * rng.random(), "basalt" if k % 2 else "basaltLight")
        else:
            prism_col(rock, (cx, fy - 0.2, back + 0.25 * rng.random()), 0.3 + 0.08 * rng.random(), F["h"] + 0.6 + 1.6 * rng.random(), "basalt" if k % 2 else "basaltLight")
    for k in range(7):
        x = F["x"] + (rng.random() - 0.5) * (F["w"] - 0.6)
        for j in range(4):
            blob(glow, x + 0.08 * math.sin(k + j), fy + F["h"] + 0.2 + j * 0.42, -half + 0.28, 0.05, 0.22, 0.03, "magma" if j % 2 else "magmaHot", cuts=0)
    box(rock, fx0, fx1, fy - 0.1, fy + F["h"], fz0 - 0.2, fz1, "stoneDark", top="basaltLight")
    box(rock, fx0 + 0.2, fx1 - 0.2, fy + F["h"], fy + F["h"] + 0.35, fz0, fz1 - 0.2, "basalt")
    box(glow, F["x"] - 0.6, F["x"] + 0.6, fy + 0.45, fy + 1.25, fz1 - 0.02, fz1 + 0.01, "forgeMouth")
    blob(glow, F["x"], fy + 0.7, fz1 - 0.02, 0.45, 0.22, 0.06, "forgeCore", cuts=1)
    for k in range(7):
        a = math.pi * k / 6
        blob(rock, F["x"] + math.cos(a) * 0.72, fy + 0.85 + math.sin(a) * 0.55, fz1 + 0.04, 0.12, 0.1, 0.08, "brick", cuts=0)
    bx_ = fx1 + 0.55
    box(rock, bx_ - 0.35, bx_ + 0.35, fy + 0.3, fy + 0.42, F["z"] + 0.1, F["z"] + 0.8, "timber")
    box(rock, bx_ - 0.32, bx_ + 0.32, fy + 0.42, fy + 0.62, F["z"] + 0.15, F["z"] + 0.75, "leather")
    box(rock, bx_ - 0.35, bx_ + 0.35, fy + 0.62, fy + 0.72, F["z"] + 0.1, F["z"] + 0.8, "timber")
    cyl(rock, (bx_ - 0.36, fy + 0.5, F["z"] + 0.45), (fx1 - 0.02, fy + 0.5, F["z"] + 0.45), 0.05, "iron", sides=6)
    cyl(rock, (bx_, fy - 0.05, F["z"] + 0.1), (bx_, fy + 0.3, F["z"] + 0.1), 0.05, "timberDark", sides=5)
    box(rock, fx0 - 1.1, fx0 - 0.25, fy - 0.05, fy + 0.4, F["z"] + 0.2, F["z"] + 0.75, "stoneDark", top="waterDark")
    for k in range(9):
        blob(rock, fx0 - 0.9 + 0.5 * rng.random(), fy + 0.08 + 0.1 * rng.random(), fz1 + 0.35 + 0.4 * rng.random(), 0.14, 0.1, 0.12, "coalChunk", cuts=0)
    # the meteorite anvil: a dark pitted lump, its top ground flat, resting on a low rock outcrop
    An = L["anvil"]
    ay = G.y(An["x"], An["z"])
    oc = An["outcrop"]
    blob(rock, An["x"], ay + oc * 0.35, An["z"], 0.62, oc * 0.55, 0.52, "limestoneDark", cuts=2, noise=0.3, seed=71, bottom=ay - 0.2)
    blob(rock, An["x"] + 0.25, ay + oc * 0.2, An["z"] - 0.2, 0.4, oc * 0.35, 0.36, "limestone", cuts=1, noise=0.3, seed=72, bottom=ay - 0.2)
    blob(rock, An["x"], ay + oc + 0.16, An["z"], 0.34, 0.2, 0.28, "meteorite", cuts=2, noise=0.25, seed=5)
    box(rock, An["x"] - 0.24, An["x"] + 0.24, ay + oc + 0.28, ay + oc + 0.33, An["z"] - 0.16, An["z"] + 0.16, "steel")
    for k in range(5):
        a = rng.random() * 6.28
        blob(glow, An["x"] + math.cos(a) * 0.3, ay + oc + 0.1 + 0.12 * rng.random(), An["z"] + math.sin(a) * 0.24, 0.025, 0.02, 0.025, "violetSoft", cuts=0)
    Cr = L["crate"]
    cy_ = G.y(Cr["x"], Cr["z"])
    box(rock, Cr["x"] - Cr["w"] / 2, Cr["x"] + Cr["w"] / 2, cy_ - 0.05, cy_ + Cr["h"], Cr["z"] - Cr["d"] / 2, Cr["z"] + Cr["d"] / 2, "timber", top="timberDark")
    for sx in (-0.3, 0.3):
        box(rock, Cr["x"] + sx - 0.03, Cr["x"] + sx + 0.03, cy_ - 0.05, cy_ + Cr["h"] + 0.005, Cr["z"] - Cr["d"] / 2 - 0.005, Cr["z"] + Cr["d"] / 2 + 0.005, "iron")
    for k in range(4):
        cyl(rock, (Cr["x"] - 0.25 + k * 0.14, cy_ + Cr["h"] - 0.1, Cr["z"] - 0.05), (Cr["x"] - 0.2 + k * 0.14, cy_ + Cr["h"] + 0.22, Cr["z"] - 0.1 + 0.05 * k), 0.022, "steel" if k % 2 else "timberDark", sides=5)


def stalagmite(M, x, y, z, r, h, rng, col="flowstone", col2="limestone"):
    """A towering stalagmite: a lumpy tapering column of dripstone, rings of flowstone down it."""
    k_n = max(4, int(h / 0.55))
    for k in range(k_n):
        t = k / k_n
        rr = r * (1 - 0.72 * t) * (0.9 + 0.2 * rng.random())
        yy = y + h * t
        blob(M, x + 0.06 * math.sin(k * 1.7), yy + h / k_n * 0.6, z + 0.06 * math.cos(k * 1.3), rr, h / k_n * 0.75, rr * 0.92, col if k % 2 else col2, cuts=1, noise=0.18, seed=int(x * 13 + z * 7) + k, bottom=y - 0.3 if k == 0 else None)
    cone(M, (x, y + h * 0.95, z), (x + 0.04, y + h * 1.12, z), r * 0.3, col, sides=6)


def crystal_cluster(glow, rock, x, y, z, s, rng, lean_to=None):
    blob(rock, x, y + 0.08 * s, z, 0.34 * s, 0.14 * s, 0.3 * s, "glimmerBase", cuts=1, noise=0.25, seed=int(x * 11 + z * 5), bottom=y - 0.2)
    for k in range(4):
        a = 2 * math.pi * k / 4 + rng.random() * 0.6
        lean = 0.25 + 0.4 * rng.random()
        d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
        if lean_to:
            d = (d[0] + lean_to[0] * 0.6, d[1], d[2] + lean_to[1] * 0.6)
        prism(glow, (x + math.cos(a) * 0.12 * s, y + 0.05, z + math.sin(a) * 0.12 * s), d, (0.06 + 0.04 * rng.random()) * s, (0.4 + 0.55 * rng.random()) * s, "cyan" if (k + int(x)) % 3 else "violet", sides=5)


def build_world(G, L, coll, ledge_top):
    half = L["half"]
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    water = Mesh("CV_Water")
    therm = Mesh("CV_ThermalWater")
    rng = random.Random(11)
    lt = L["lights"]

    # --- the light painted in ---
    add_light(1.0, 13.0, -16.5, "#FFD27A", 2.6, 17.0)  # the sun down the doline
    add_light(-6.0, 9.0, -20.0, "#FFE2A8", 1.2, 9.0)
    add_light(7.0, 9.0, -20.0, "#FFE2A8", 1.2, 9.0)
    add_light(*lt["forge"], "#FF8A3A", 2.8, 8.5)
    add_light(L["forge"]["x"], G.y(L["forge"]["x"], L["forge"]["z"]) + 4.5, -half + 0.6, "#FF5A1F", 1.4, 5.0)  # its magma veins
    add_light(*lt["thermal"], "#FFE9C4", 1.6, 8.0)
    add_light(*lt["cenote"], "#35E6FF", 1.9, 10.5)
    add_light(L["skylight"]["x"], 9.0, L["skylight"]["z"], "#D6ECFF", 1.4, 11.0)
    add_light(L["finnegan"]["x"] + 0.7, G.y(L["finnegan"]["x"], L["finnegan"]["z"]) + 0.5, L["finnegan"]["z"] + 0.3, "#FFB347", 1.2, 4.5)
    Wk = L["workstation"]
    add_light(Wk["x"] + 0.9, G.y(Wk["x"], Wk["z"]) + 1.3, Wk["z"], "#FFB347", 1.3, 4.5)
    add_light(L["adit"]["x"] + 1.3, G.y(L["adit"]["x"], -half + 1.5) + 2.0, L["adit"]["z"] + 0.6, "#FFB347", 1.3, 4.5)
    for x, z, s in L["crystals"]:
        add_light(x, G.y(x, z) + 0.6 * s, z, "#00F0FF" if (int(x * 7 + z * 3) % 3) else "#9D00FF", 0.95 * s, 2.8 * s + 0.6)
    for x, z, s in L["shrooms"]:
        add_light(x, G.y(x, z) + 0.45 * s, z, "#4FFFD2" if (int(x * 5 + z) % 2) else "#FF7AD9", 0.75 * s, 2.3 * s + 0.5)
    for n in L["nodes"]:
        if n["kind"] in ("silver", "glimmer"):
            add_light(n["x"], G.y(n["x"], n["z"]) + 0.8, n["z"], "#6FF6FF" if n["kind"] == "glimmer" else "#DFF6FF", 0.9, 3.0)

    # --- the ground, the water, the walls and their vault ---
    build_ground(G, L, rock, water)
    build_shell(G, L, shell, glow, rock, rng)
    build_outpost(G, L, rock, glow, rng)

    # --- the open rim: the ground's section down its south and east edges, strata in it ---
    n = G.n
    for edge in ("south", "east"):
        prev = None
        for t in range(n):
            if edge == "south":
                x, z = G.at(t, n - 1)
            else:
                x, z = G.at(n - 1, t)
            y = G.h[(n - 1) * n + t] if edge == "south" else G.h[t * n + n - 1]
            top = rock.v(x, y, z)
            bot = rock.v(x, -2.8, z)
            rock.setv(top, "strata")
            rock.setv(bot, "sectionDark")
            if prev:
                q = (prev[0], top, bot, prev[1]) if edge == "south" else (prev[1], bot, top, prev[0])
                rock.setsmooth(rock.face(q, "strata"))
            prev = (top, bot)

    # --- the tumbled boulders, the fins, the towering stalagmites ---
    def tumbled(x, z, r, colr, dark, seed):
        # a tumbled rock: an angular hull, lighter where it faces up, and a smaller one fallen by it
        brng = random.Random(seed)
        y = G.y(x, z)
        for f in chunk(rock, r, r * 1.35, brng, sink=0.25, squash=0.85, at=(x, y, z), npts=16):
            f.normal_update()
            rock.setf(f, colr if f.normal.z > 0.4 else dark)
        sx, sz = x + r * 0.6, z + r * 0.45
        for f in chunk(rock, r * 0.42, r * 0.5, brng, sink=0.1, at=(sx, G.y(sx, sz), sz), npts=10):
            f.normal_update()
            rock.setf(f, dark)

    for x, z, r in L["boulders"]:
        colr, dark = ("slate", "slateWet") if x < -13 and z < -8 else (("chasmFloor", "tunnel") if x > 13 and z < 2 else ("limestone", "limestoneDark"))
        tumbled(x, z, r, colr, dark, int(x * 17 + z * 3) & 0xFFFF)
    for x, z, rx, rz, h, yaw in L["fins"]:
        y = G.y(x, z)
        ln, w = max(rx, rz), min(rx, rz)
        along = (math.cos(yaw), -math.sin(yaw)) if rx >= rz else (math.sin(yaw), math.cos(yaw))
        for k in range(6):
            t = -ln + 2 * ln * (k + 0.5) / 6
            hh = h * (0.55 + 0.45 * math.sin(math.pi * (k + 0.5) / 6))
            blob(rock, x + along[0] * t, y + hh * 0.5, z + along[1] * t, w * 1.05, hh * 0.55, w * 1.05, "chasmFloor" if k % 2 else "slate", cuts=1, noise=0.25, seed=int(x * 7) + k, bottom=y - 0.3)
    for x, z, r, h in L["stalagmites"]:
        stalagmite(rock, x, G.y(x, z), z, r, h, rng)
    for x, z, s in L["crystals"]:
        crystal_cluster(glow, rock, x, G.y(x, z), z, s, rng)
    for x, z, s in L["shrooms"]:
        y = G.y(x, z)
        for k in range(4):
            a = 2 * math.pi * k / 4 + rng.random()
            px, pz = x + math.cos(a) * 0.22 * s, z + math.sin(a) * 0.22 * s
            hh = (0.25 + 0.3 * rng.random()) * s
            cyl(rock, (px, y - 0.05, pz), (px, y + hh, pz), 0.04 * s, "shroomStem", sides=5)
            blob(glow, px, y + hh, pz, 0.14 * s, 0.06 * s, 0.14 * s, "shroomTeal" if (k + int(x)) % 2 else "shroomPink", cuts=1)

    # --- the nodes' host rocks (a node sits in it, its face out), their seams and alcoves ---
    for nd in L["nodes"]:
        kind = nd["kind"]
        x, z = nd["x"], nd["z"]
        y = G.y(x, z)
        r = ORE_RADII[kind]
        fx, fz = nd["face"]
        fl = math.hypot(fx, fz) or 1
        fx, fz = fx / fl, fz / fl
        wall = x <= L["walls"]["west"] + 1.3 or z <= L["walls"]["north"] + 1.3
        host = "limestone" if kind in ("coal", "copper") else ("slate" if kind == "iron" else "chasmFloor")
        if kind == "monolith":
            # its shrine under the roots: a ring of fallen stone round its foot, moss
            for k in range(7):
                a = 2 * math.pi * k / 7 + 0.3
                blob(rock, x + math.cos(a) * 1.45, y + 0.12, z + math.sin(a) * 1.3, 0.28, 0.16, 0.24, "limestoneDark" if k % 2 else "mossA", cuts=1, noise=0.25, seed=700 + k, bottom=y - 0.2)
            continue
        if wall:
            # a seam in the wall: a recess of darker rock round the node, and its lip
            bx, bz = x - fx * 0.55, z - fz * 0.55
            blob(rock, bx, y + r * 1.2, bz, r * 1.6, r * 1.8, r * 1.4, "slateWet" if kind == "iron" else ("shellCold" if kind in ("silver", "glimmer") else "strata"), cuts=2, noise=0.3, seed=int(x * 3 + z * 11), bottom=y - 0.3)
        else:
            bx, bz = x - fx * (r + 0.45), z - fz * (r + 0.45)
            hdark = {"limestone": "limestoneDark", "slate": "slateWet", "chasmFloor": "tunnel"}[host]
            tumbled(bx, bz, r + 0.42, host, hdark, int(abs(x * 31 + z * 7)) & 0xFFFF)
        if kind == "iron":
            # moss down the seam
            for k in range(3):
                blob(rock, x - fx * 0.2 + (rng.random() - 0.5) * 0.8, y + 0.9 + k * 0.35, z - fz * 0.2 + (rng.random() - 0.5) * 0.4, 0.14, 0.2, 0.12, "slateMoss", cuts=0)
        if kind in ("silver", "glimmer"):
            # the alcove's crystals either side of it
            for sd in (-1, 1):
                cx_, cz_ = x - fz * sd * (r + 0.55) - fx * 0.2, z + fx * sd * (r + 0.55) - fz * 0.2
                crystal_cluster(glow, rock, cx_, G.y(cx_, cz_), cz_, 0.6, rng, lean_to=(fx, fz))

    # --- the doline's life: ferns in the lee of its boulders, moss tufts; pebbles along the trails ---
    for k in range(42):
        x = -12.0 + rng.random() * 24.0
        z = -21.0 + rng.random() * 9.5
        if not G.walk(x, z) or any(math.hypot(x - b[0], z - b[1]) < b[2] + 0.3 for b in L["boulders"]):
            continue
        fern(rock, x, G.y(x, z), z, 0.25 + 0.2 * rng.random(), rng)

    # --- the Travertine Thermal Terraces: rimstone dams carved into the slope, warm water in them,
    # cascades over their lips, the spring from the wall, the six stone seats ---
    pools = G.pools
    for pi, P in enumerate(pools):
        (cx, cz, rx, rz), outline = pool_outline(G, pi, pi * 1.7 + 0.3)
        wy_ = P["y"]
        # the dam: rounded travertine all round the rim (organic: no straight edge)
        for k, (px, pz) in enumerate(outline):
            if k % 4 == 3:
                continue
            gy = max(G.y(px, pz), wy_ - 0.2)
            top_ = max(gy, wy_) + 0.06
            blob(rock, px + (cx - px) * 0.05, (top_ + wy_ - 0.35) / 2, pz + (cz - pz) * 0.05, 0.3, (top_ - wy_ + 0.35) / 2 + 0.03, 0.26, "travertine" if k % 3 else "flowstoneWarm", cuts=1, noise=0.18, seed=pi * 40 + k)
        # the pool's water just inside the dam
        wv = [therm.v(px, wy_, pz) for px, pz in [(cx + (qx - cx) * 0.92, cz + (qz - cz) * 0.92) for qx, qz in outline]]
        mid = therm.v(cx, wy_, cz)
        for k in range(len(wv)):
            f = therm.face((mid, wv[(k + 1) % len(wv)], wv[k]), "thermalWater")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        # the cascade over its south lip into the next pool, foam at its foot
        if pi + 1 < len(pools):
            ny = pools[pi + 1]["y"]
            for k in range(2):
                ccx = cx - 0.8 + 1.6 * k
                q = [therm.v(ccx - 0.3, wy_ + 0.02, cz + rz - 0.05), therm.v(ccx + 0.3, wy_ + 0.02, cz + rz - 0.05), therm.v(ccx + 0.34, ny - 0.02, cz + rz + 0.35), therm.v(ccx - 0.34, ny - 0.02, cz + rz + 0.35)]
                therm.face(q, "thermalWater")
                blob(rock, ccx, ny + 0.02, cz + rz + 0.45, 0.3, 0.03, 0.14, "foam", cuts=1)
        else:
            # the last spills down the slope toward the lake
            for k in range(3):
                t = (k + 1) / 4
                blob(rock, cx + 1.2 * t, wy_ - 0.2 * k, cz + rz + 0.4 + 1.5 * t, 0.3, 0.03, 0.18, "foam", cuts=1)
        # the stone seats under the water
        for st in L["thermalSeats"]:
            if P["z0"] <= st["z"] <= P["z1"]:
                blob(rock, st["x"], wy_ + ledge_top - 0.12, st["z"], 0.36, 0.14, 0.32, "travertine", cuts=1, noise=0.15, seed=int(st["z"] * 10), bottom=wy_ - 0.4, top=wy_ + ledge_top)
    sp_z = (L["terraces"]["pools"][0]["z0"] + L["terraces"]["pools"][0]["z1"]) / 2
    for k in range(6):
        blob(rock, -half + 0.9, pools[0]["y"] + 0.25 + k * 0.32, sp_z + 0.2 * math.sin(k), 0.16, 0.24, 0.28, "flowstoneWarm", cuts=1)
    q = [therm.v(-half + 1.05, pools[0]["y"] + 2.1, sp_z - 0.25), therm.v(-half + 1.05, pools[0]["y"] + 2.1, sp_z + 0.25), therm.v(-half + 1.15, pools[0]["y"] + 0.01, sp_z + 0.35), therm.v(-half + 1.15, pools[0]["y"] + 0.01, sp_z - 0.35)]
    therm.face(q, "thermalWater")

    # --- the islet: its rocky shore, the karst tower, the mangrove and its aerial roots weeping down
    # round the Monolith ---
    I = L["islet"]
    for k in range(14):
        a = 2 * math.pi * k / 14 + rng.random() * 0.3
        rr = I["r"] * (0.95 + 0.1 * rng.random())
        px = I["x"] + math.cos(a) * rr * (1 + 0.12 * math.sin(3 * a + 1.0))
        pz = I["z"] + math.sin(a) * rr * (1 + 0.12 * math.sin(3 * a + 1.0))
        if min(math.hypot(px - s[0], pz - s[1]) for s in L["sandbar"]["points"]) < L["sandbar"]["half"] + 0.5:
            continue
        blob(rock, px, 0.05, pz, 0.35 + 0.2 * rng.random(), 0.3 + 0.2 * rng.random(), 0.32, "limestone", cuts=1, noise=0.3, seed=200 + k, bottom=-0.6)
    for k in range(9):
        a = rng.random() * 6.28
        rr = I["r"] * (0.3 + 0.35 * rng.random())
        px, pz = I["x"] + math.cos(a) * rr, I["z"] + math.sin(a) * rr
        if math.hypot(px - L["nodes"][-1]["x"], pz - L["nodes"][-1]["z"]) < 1.5:
            continue
        fern(rock, px, G.y(px, pz), pz, 0.3 + 0.2 * rng.random(), rng)
    Tw = L["tower"]
    tx, tz, tower_h = Tw["x"], Tw["z"], Tw["h"]
    for k in range(6):
        yk = tower_h * k / 6
        w = 0.95 - 0.25 * math.sin(k / 5 * math.pi) + 0.1 * (k == 5)
        blob(roots, tx + 0.1 * math.sin(k * 1.3), yk + 0.55, tz + 0.1 * math.cos(k * 1.7), w, 0.7, w * 0.9, "limestone" if k % 2 else "limestoneDark", cuts=2, noise=0.25, seed=600 + k)
    blob(roots, tx, tower_h + 0.35, tz, 1.25, 0.35, 1.1, "limestone", cuts=2, noise=0.3, seed=611)
    blob(roots, tx, tower_h + 0.6, tz, 1.15, 0.2, 1.0, "mossA", cuts=2, noise=0.3, seed=612)
    cyl(roots, (tx, tower_h + 0.5, tz), (tx + 0.2, tower_h + 1.6, tz - 0.1), 0.18, "rootDark", sides=7, r_end=0.12)
    for k, (dx, dy, dz, r) in enumerate([(0.2, 2.1, -0.1, 1.0), (0.8, 1.8, 0.3, 0.7), (-0.6, 1.9, -0.4, 0.75), (0.1, 2.5, 0.4, 0.6)]):
        blob(roots, tx + dx, tower_h + dy, tz + dz, r, r * 0.7, r, "fern" if k % 2 else "mossB", cuts=2, noise=0.2, seed=620 + k)
    Mo = L["nodes"][-1]
    for k in range(22):
        # the roots: from the crown out over the Monolith and down into the islet and the water
        a = math.radians(-50 + 300 * k / 21 + 8 * rng.random())
        rr = 1.05 + 0.35 * rng.random()
        top = (tx + math.cos(a) * rr, tower_h + 0.4, tz + math.sin(a) * rr)
        reach = 1.0 + 1.6 * rng.random() if k % 3 else 2.4 + 1.0 * rng.random()
        toward = (Mo["x"] - tx, Mo["z"] - tz)
        tl = math.hypot(*toward) or 1
        fx_ = tx + math.cos(a) * (rr + 0.3) + toward[0] / tl * reach * (0.6 if k % 3 == 0 else 0.2)
        fz_ = tz + math.sin(a) * (rr + 0.3) + toward[1] / tl * reach * (0.6 if k % 3 == 0 else 0.2)
        g = G.y(fx_, fz_)
        end_y = max(g, L["lake"]["water"] - 0.05) + (0.0 if rng.random() < 0.7 else 0.8 + 1.2 * rng.random())
        mid = (top[0] + (fx_ - top[0]) * 0.45, (top[1] + end_y) / 2 + 0.4, top[2] + (fz_ - top[2]) * 0.45)
        r0 = 0.05 + 0.03 * rng.random()
        cyl(roots, top, mid, r0, "root", sides=5, cap=False)
        cyl(roots, mid, (fx_, end_y, fz_), r0 * 0.8, "rootDark", sides=5, r_end=r0 * 0.35, cap=False)

    # --- the lake's margins: driftwood washed up, reeds by the shallows ---
    K = L["lake"]
    for k in range(18):
        a = 2 * math.pi * k / 18 + rng.random() * 0.2
        f = 1.1 + 0.08 * rng.random()
        wob = 1 + 0.05 * math.sin(3 * a + 0.7) + 0.035 * math.sin(5 * a + 2.1)
        px = K["x"] + math.cos(a) * K["rx"] * f * wob
        pz = K["z"] + math.sin(a) * K["rz"] * f * wob
        if abs(px) > half - 1 or abs(pz) > half - 1:
            continue
        if k % 3 == 0:
            ang = rng.random() * 3.14
            ln = 0.6 + 0.6 * rng.random()
            y = G.y(px, pz)
            cyl(rock, (px - math.cos(ang) * ln / 2, y + 0.06, pz - math.sin(ang) * ln / 2), (px + math.cos(ang) * ln / 2, y + 0.08, pz + math.sin(ang) * ln / 2), 0.06, "driftwood", sides=6)
        else:
            y = G.y(px, pz)
            for j in range(3):
                rx_, rz_ = px + (rng.random() - 0.5) * 0.5, pz + (rng.random() - 0.5) * 0.5
                cyl(rock, (rx_, y - 0.05, rz_), (rx_ + (rng.random() - 0.5) * 0.15, y + 0.4 + 0.4 * rng.random(), rz_ + (rng.random() - 0.5) * 0.15), 0.012, "fern" if j % 2 else "mossB", sides=3, r_end=0.004, cap=False)

    # (the glows, the ferns and the reeds smooth: shading barely shows on them, and a smooth face
    # shares its vertices in the export instead of taking three of its own)
    for f in glow.bm.faces:
        glow.setsmooth(f)
    finish_object("Cave_Rock", rock, coll, mottle=0.08)
    finish_object("Cave_Shell", shell, coll, mottle=0.08)
    finish_object("Cave_Roots", roots, coll, mottle=0.1)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)
    build_collider(G, coll)


# ---------------------------------------------------------------------------------------------
# the ore nodes' rocks: one template a kind, at the origin, its foot on (and sunk into) the floor


def chunk(M, r, h, rng, sink=0.14, squash=0.9, at=(0.0, 0.0, 0.0), npts=20):
    """An angular rock: the hull of points round a squat ellipsoid, flat faceted faces (its foot at
    `at`, sunk `sink` into the floor)."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    ox, oy, oz = at
    pts = []
    for k in range(npts):
        u = rng.uniform(-1, 1)
        a = rng.uniform(0, 2 * math.pi)
        s = math.sqrt(1 - u * u)
        rr = r * (0.72 + 0.4 * rng.random())
        y = max(-sink, (u * 0.5 + 0.5) * h - sink)
        pts.append(bm.verts.new(W(ox + math.cos(a) * s * rr, oy + y, oz + math.sin(a) * s * rr * squash)))
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.random() * 0.4
        pts.append(bm.verts.new(W(ox + math.cos(a) * r * 1.05, oy - sink, oz + math.sin(a) * r * 0.95 * squash)))
    hull = bmesh.ops.convex_hull(bm, input=pts)
    # (the points the hull left inside or unused, once each)
    bm.verts.index_update()
    junk = list({g.index: g for g in hull["geom_interior"] + hull["geom_unused"] if isinstance(g, bmesh.types.BMVert)}.values())
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    faces = [f for f in bm.faces if any(not v.tag for v in f.verts)]
    for v in bm.verts:
        v.tag = False
    return faces


def ore_rock(kind, r, coll):
    rock = Mesh("CV_OreRock")
    glow = Mesh("CV_OreGlow")
    rng = random.Random(sum(ord(c) for c in kind) * 97)
    if kind == "monolith":
        # a tall obelisk of dark stone, bevelled, cracked with violet runes; broken stones round its foot
        h = 2.6
        levels = 7
        for k in range(levels):
            y0 = h * k / levels - (0.12 if k == 0 else 0.0)
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
    else:
        body, dark, fac, glowc = {
            "coal": ("coalRock", "coalChunk", "coalChunk", "ember"),
            "copper": ("copperRock", "strataDark", "copperNug", "copperGlow"),
            "iron": ("ironRock", "slateWet", "rust", "ironGlow"),
            "silver": ("silverRock", "slate", "silverVein", "silverVein"),
            "glimmer": ("glimmerBase", "tunnel", "glimmerBase", "cyan"),
        }[kind]
        h = r * (1.25 if kind != "glimmer" else 0.8)
        faces = chunk(rock, r, h, rng)
        for f in faces:
            f.normal_update()
            nz = f.normal.z  # (Blender's up)
            rock.setf(f, body if nz > 0.35 else dark)
        # the mineral: some facets its colour, and a few of those glowing (an inset copy of the facet
        # a hair out along its normal, in the glow finish)
        picks = [f for f in faces if f.normal.z > -0.2]
        rng.shuffle(picks)
        for k, f in enumerate(picks[: 7 if kind != "glimmer" else 3]):
            rock.setf(f, fac)
            if k < (4 if kind in ("silver", "copper") else 3):
                c = f.calc_center_median()
                nrm = f.normal
                inset = [bm_v.co + (c - bm_v.co) * 0.45 + nrm * 0.006 for bm_v in f.verts]
                vs = [glow.bm.verts.new(p) for p in inset]
                glow.face(vs, glowc)
        if kind == "glimmer":
            for k in range(9):
                a = 2 * math.pi * k / 9 + rng.random() * 0.4
                lean = 0.2 + 0.5 * rng.random() if k else 0.0
                d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
                prism(glow, (math.cos(a) * r * 0.35 * (k > 0), h * 0.5, math.sin(a) * r * 0.35 * (k > 0)), d, (0.07 + 0.05 * rng.random()) * (1.5 if k == 0 else 1), (0.5 + 0.5 * rng.random()) * (1.6 if k == 0 else 1), "cyan" if k % 3 else "violet")
    ob_r = finish_object(f"Ore_{kind}", rock, coll, bake=False, mottle=0.1)
    ob_g = finish_object(f"Ore_{kind}_Glow", glow, coll, bake=False)
    ob_g.parent = ob_r
    return ob_r


def build_ores(coll, radii):
    made = [ore_rock(kind, radii[kind], coll) for kind in ("coal", "copper", "iron", "silver", "glimmer", "monolith")]
    # a broken node's stump: dark, rough, fractured bedrock, a few shards round it
    rubble = Mesh("CV_OreRock")
    rng = random.Random(99)
    faces = chunk(rubble, 0.36, 0.26, rng, sink=0.1, squash=0.85)
    for f in faces:
        rubble.setf(f, "rubble")
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.random() * 0.4
        blob(rubble, 0.16 * math.cos(a), 0.17, 0.14 * math.sin(a), 0.1, 0.02, 0.018, "rubbleCrack", cuts=0)
    for k in range(6):
        a = rng.random() * 6.283
        rr = 0.34 + 0.18 * rng.random()
        blob(rubble, rr * math.cos(a), 0.03, rr * math.sin(a), 0.07 + 0.05 * rng.random(), 0.04 + 0.03 * rng.random(), 0.06 + 0.04 * rng.random(), "rubble", cuts=0, noise=0.2, seed=k, bottom=-0.02)
    made.append(finish_object("Ore_Rubble", rubble, coll, bake=False, mottle=0.12))
    return made


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    LIGHTS.clear()
    L = read_layout(root)
    LAYOUT.clear()
    LAYOUT.update(L)
    G = Ground(read_terrain(root))
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    ORE_RADII.clear()
    ORE_RADII.update(read_ore_radii(root))
    build_world(G, L, coll, read_thermal_ledge(root))
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
    static = {k: v for k, v in out.items() if not k.startswith("Ore_") and k != "caverns_walk_collider"}
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
        # (the ore templates sit at the origin, the collider is never drawn: neither in the studio's grid)
        for o in list(coll.all_objects):
            if o.name.startswith("Ore_") or o.name == "caverns_walk_collider":
                bpy.data.objects.remove(o, do_unlink=True)
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
