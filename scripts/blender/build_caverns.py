"""The Glimmering Caverns diorama (after Hang Son Doong): builds client/public/models/caverns.glb.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    npm run caverns-terrain
    blender -b --factory-startup -P scripts/blender/build_caverns.py

(CAVERNS_NO_STUDIO=1 for a trial that neither opens nor saves the studio's master file, CAVERNS_OUT
for somewhere else to write the .glb.) It only ever touches its own "Caverns" collection: purge()
removes that collection's objects and the data nothing uses any more, never anything of another
world's; the export takes only this collection's objects (use_selection).

Nothing is placed by hand. Where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is), and the ground itself
from the very grid the game walks: scripts/blender/data/caverns_terrain.json (`npm run
caverns-terrain` writes it from caverns.ts; `npm run check-layout` fails while it is stale): a vertex
every 0.5 m with its height and what it is, and the 0.25 m mask of where you can stand. A 45 x 45
organic karst after the world's greatest cave: the sunlit doline's limestone floor under layered moss
(3.0 to 3.8 m), the great talus of fractured blocks down to the overlook's pavement (1.8 m) and on to
the cenote's white-gold beach, its emerald lake and the submerged shoal out to the islet's crag, the
travertine terraces down the west cliff, the abyssal chasm sunk into the east. No stairs, no slabs,
no rows of cones.

The rock is sculpted, never modelled piece by piece (`sculpt`): monolithic rough solids (the walls'
sheet thickened into the hill; the mounds, outcrops, boulders and the islet's crag heaped as hulls
and lumps) fused by a voxel remesh into one seamless mantle, carved by Booleans (the adit's bore and
the forge's cleft, cut true into the fused rock), weathered by displacement (Voronoi pits, a ridged
Musgrave's strata stretched along the beds) and decimated into crisp low-poly facets. Stylised clay
like the other worlds, every colour a vertex colour and the light painted in. One mesh per finish:

    caverns_walk_collider  CV_Clay   the floor, which is the game's click collider too: the walk
                                     grid's triangles exactly, painted by what they are (the rock
                                     slopes away from any footing roughened, the pools carved)
    Cave_Rock       CV_Clay          the sculpted mass (the doline's terraced moss-draped mounds, the
                                     talus's mammoth outcrops, the fallen boulders, the islet's crag),
                                     the talus blocks and the doline's breakdown rubble, the fluted
                                     dripstone, the fault seams, the Expedition Basecamp (Gus's log
                                     workstation, the canvas tarp on its timber posts, the crates, the
                                     specimen jars, the brass survey transit, the oil lanterns), the
                                     forge in its columnar basalt cleft (the crucible, the bellows,
                                     the quench trough), the meteorite anvil on its limestone pedestal
                                     (chisels, a mallet, split geodes), the adit's bore, timber sets,
                                     lagging and rails, the terraces' rimstone collars, the shore's
                                     reeds and driftwood, the section of the open rim
    Cave_Shell      CV_Shell         the north wall and the towering west cliff rising into the vault
                                     (broken open over the doline, where the sun comes in), sculpted,
                                     and the fluted stalactites in its pockets; double sided
    Cave_Glow       CV_Glow          what glows (the game lights it from its own vertex colours): the
                                     crystals, the mushrooms' caps, the lanterns, the crucible and the
                                     magma veins up the cleft, the runes burnt into the basalt, the
                                     specimens, the seams' mineral flecks
    Cave_Water      CV_Water         the cenote's surface (transparent in the game, no depth write)
    Cave_Thermal    CV_ThermalWater  the terraces' warm water and its cascades (the same)
    Cave_Roots      CV_Occluder      the banyan's limbs and buttress roots twisting down from the
                                     islet's crag into the deep, its crown, the aerial vines hanging
                                     from the doline's broken roof, the chasm's slate cliffs (all
                                     dithered where they stand between you and the camera)

and the ore nodes' rocks, each at the origin (its pivot on its floor, its foot sunk into it), for the
game to place at every node of its kind, instanced:

    Ore_<kind>      CV_OreRock + CV_OreGlow   coal, copper, iron, silver, glimmer, monolith
    Ore_Rubble      CV_OreRock                what a broken node leaves till it grows back: a dark,
                                              rough stump of fractured bedrock

The export is packed (`quantize_glb`): the static meshes' positions stored as 16-bit integers under
their node's scale and offset, their normals and colours as bytes (KHR_mesh_quantization, which
three's loader reads): under 1.8 MB.

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
DOUBLE_SIDED = {"CV_Shell", "CV_Water", "CV_ThermalWater", "CV_Fauna", "CV_Frame"}
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


def fern(M, x, y, z, s, rng, pale=False):
    """A low-poly fern: a ring of arching fronds, each a bent strip (a pale cave fern where the sun
    never reaches)."""
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
            f = M.face(q, ("fernPaleLight" if j == 1 else "fernPale") if pale else ("fernLight" if j == 1 else "fern"))
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
        "chasmFloor": "#4E4A46",
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
FINISHES["CV_Fauna"] = 0.8
FINISHES["CV_Frame"] = 0.95


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
    # (an even base, no smudges of dark: the game's own lights, the doline's sun and its shadows,
    # give the cavern its depth)
    doline = smooth(-2.5, -9.5, z) * (1 - smooth(12.0, 15.0, x)) * (1 - 0.5 * smooth(-12.0, -15.0, x))
    chasm = smooth(12.0, 16.0, x) * smooth(4.0, -2.0, z)
    base = (0.66, 0.68, 0.72)
    warm = (0.8, 0.77, 0.7)
    deep = (0.56, 0.57, 0.6)
    a = tuple(base[i] + (deep[i] - base[i]) * chasm for i in range(3))
    a = tuple(a[i] + (warm[i] - a[i]) * doline * 0.6 for i in range(3))
    fade = 1 - 0.22 * smooth(6.0, 12.0, y) * (1 - doline)
    return tuple(c * fade for c in a)


def mixc(a, b, t):
    ca = lin(a) if isinstance(a, str) else a
    cb = lin(b) if isinstance(b, str) else b
    t = max(0.0, min(1.0, t))
    return tuple(ca[i] + (cb[i] - ca[i]) * t for i in range(3))


C.update(
    {
        # Hang Son Doong: pale limestone, layered moss, emerald water
        "limeFloor": "#CFC6AE",
        "limeWarm": "#DDD0AE",
        "limeCool": "#B7B2A4",
        "mossDeep": "#3D6A2C",
        "mossMid": "#5E8E38",
        "mossLime": "#A2C65C",
        "bedShallow": "#8FDCCB",
        "bedEmerald": "#2FB39E",
        "bedAbyss": "#0B4A5E",
        "brass": "#C9A24A",
        "brassDark": "#8C6B2A",
        "canvas": "#C8B894",
        "canvasShade": "#A8977A",
        "glass": "#CFE3E0",
        "runeFire": "#FF9A3C",
        "vine": "#4E7F34",
        "vineLight": "#7BAA48",
        "banyan": "#7A6A58",
        "banyanDark": "#54483C",
        "slateCliff": "#5E5B5C",
        "slateCliffLight": "#8A857D",
        "thermalWater": "#8FE3D8",
        "basaltDeep": "#16151B",
        "damp": "#4A463E",
        "slag": "#2E3A36",
        "slagViolet": "#3B2F42",
        "charcoal": "#141315",
        "emberDeep": "#B8320E",
        "boatWood": "#7E7162",
        "boatWoodDark": "#5B5046",
        "algae": "#3F5E3A",
        "rustDark": "#5C3420",
        "crabShell": "#1F8E86",
        "crabGlow": "#8FFFF0",
        "swift": "#3A332E",
        "swiftBelly": "#8C7B68",
        "beetle": "#B98CFF",
        "beetleGlow": "#E6D2FF",
        "wetSheen": "#56716E",
        "cartRust": "#B0632F",
        "fernPale": "#A3AE95",
        "fernPaleLight": "#C8D0BB",
        "lichen": "#B9C0A6",
        "reedPale": "#B3AC88",
        "reedPaleDark": "#8D876A",
        "sandDamp": "#8A785A",
        "trailDirt": "#B08D68",
        "trailGravel": "#D3BF9A",
        "trailEdge": "#8E7152",
        "basaltCol": "#4A4850",
        "basaltColLight": "#5C5962",
        "basaltTop": "#858089",
        "flagstone": "#958B7B",
        "flagstoneDark": "#72695C",
        "frameRock": "#141210",
        "frameRockLight": "#2A2520",
        "cartRustDark": "#7E4122",
        "boatPlank": "#9A8B78",
    }
)
_game = G  # (the builders' `G` parameter is the ground: this is the point converter)
GEO_STATS = {}


def ground_colour(x, y, z, s, d):
    """A floor vertex's colour by what it is (the grid's surface): limestone and moss in the doline,
    scree on the talus trails, white-gold sand, the emerald lake's bed, the chasm's cold slate."""
    n1 = fbm(x * 0.45, 0.3, z * 0.45, 11)
    n2 = fbm(x * 1.6, 0.7, z * 1.6, 13)
    n3 = fbm(x * 3.1, 1.1, z * 3.1, 17)
    if s == 0:  # bare rock: limestone and its strata, moss creeping over it under the doline's sun
        band = 0.5 + 0.5 * math.sin(y * 6.5 + n1 * 3.0)
        c = mixc("limeCool", "limestoneDark", band * 0.6)
        c = mixc(c, "strata", max(0.0, n2) * 0.4)
        if z < -9.0 and y > 2.4:
            c = mixc(c, "mossDeep", smooth(-0.1, 0.3, n1 + 0.3 * n3) * 0.8)
        return c
    if s == 1:  # the doline's limestone floor under layered moss: patches, never a lawn
        c = mixc("limeFloor", "limeWarm", 0.5 + 0.5 * n2)
        moss = smooth(-0.08, 0.22, n1 + 0.35 * n3)
        c = mixc(c, mixc("mossDeep", "mossMid", 0.5 + 0.5 * n2), moss * 0.9)
        return mixc(c, "mossLime", smooth(0.25, 0.5, n3) * moss * 0.6)
    if s == 2:  # the explorer's trail: warm packed dirt, fine gravel scattered on it
        c = mixc("trailDirt", "trailEdge", 0.3 + 0.3 * n1)
        return mixc(c, "trailGravel", smooth(0.15, 0.45, n3) * 0.7)
    if s == 3:  # sand, wet toward the water, dark and damp in the rim the water touches
        c = mixc("sand", "sandGold", 0.5 + 0.5 * n1)
        c = mixc(c, "sandWet", smooth(0.25, -0.08, y))
        return mixc(c, "sandDamp", smooth(0.16, -0.02, y) * 0.85)
    if s == 4:  # the shelf's wet slate, worn pale by the drip, mossy seams, blending into limestone
        c = mixc("slate", "limeCool", 0.3 + 0.25 * (0.5 + 0.5 * n2))
        c = mixc(c, "slateWet", max(0.0, n1) * 0.4)
        return mixc(c, "slateMoss", max(0.0, n3) * 0.6)
    if s == 5:  # the chasm's trench: bare slate bedrock in beds, cracked, glow moss in the hollows
        c = mixc("slateCliff", "slateCliffLight", 0.5 + 0.5 * n1)
        c = mixc(c, "limestoneDark", (0.5 + 0.5 * math.sin(y * 9.0 + n2 * 3.0)) * 0.25)
        c = mixc(c, "tunnel", smooth(0.1, 0.02, abs(n3)) * 0.55)
        return mixc(c, "chasmMoss", smooth(0.25, 0.55, n2) * 0.45)
    if s == 6:  # travertine
        return mixc("travertine", "travertineShadow", 0.5 + 0.5 * n2)
    if s == 7:  # the lake's bed: pale sand to emerald to the turquoise abyss
        c = mixc("sandWet", "bedShallow", smooth(-0.08, -0.35, y))
        c = mixc(c, "bedEmerald", smooth(-0.35, -1.0, y))
        return mixc(c, "bedAbyss", smooth(-1.0, -2.3, y))
    if s == 8:  # the overlook's pale limestone pavement, its grikes dark
        c = mixc("limestonePale", "limeFloor", 0.5 + 0.5 * n2)
        return mixc(c, "limestoneDark", smooth(0.35, 0.6, abs(n3)) * 0.55)
    # the low ground: limestone and packed earth, moss in the damp
    c = mixc("limeCool", "earthPacked", 0.5 + 0.5 * n1)
    return mixc(c, "mossMid", max(0.0, n2) * 0.4)


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


def lake_factor(L, x, z):
    """How far out on the lake a point is against its shore (shared/worlds/caverns.ts lakeFactor):
    under 1 the water, 1 the waterline."""
    lk = L["lake"]
    dx, dz = (x - lk["x"]) / lk["rx"], (z - lk["z"]) / lk["rz"]
    a = math.atan2(dz, dx)
    wob = 1 + 0.08 * math.sin(2 * a + 0.4) + 0.06 * math.sin(3 * a + 0.7) + 0.04 * math.sin(5 * a + 2.1) + 0.025 * math.sin(9 * a + 1.3)
    return math.hypot(dx, dz) / wob


def runoff_paths(G, L):
    """The groundwater's runoff: from the doline's rim and the terraces' last pool, each traced
    downhill over the floor (a little wander) until it reaches the lake or the flat."""
    starts = [(-6.4, -10.6), (2.3, -10.6), (9.6, -10.9), (-15.4, -8.9), (-17.6, 5.6), (-10.6, -3.0)]
    lake = L["lake"]
    out = []
    for k, (x, z) in enumerate(starts):
        pts = [(x, z)]
        flat = 0
        for step in range(110):
            e = 0.25
            gx = (G.y(x + e, z) - G.y(x - e, z)) / (2 * e)
            gz = (G.y(x, z + e) - G.y(x, z - e)) / (2 * e)
            gl = math.hypot(gx, gz)
            tx, tz = lake["x"] - x, lake["z"] - z
            tl = math.hypot(tx, tz) or 1.0
            if gl < 0.03:
                flat += 1
                dx, dz = tx / tl, tz / tl
            else:
                w = smooth(0.03, 0.2, gl)
                dx = -gx / gl * w + tx / tl * (1 - w)
                dz = -gz / gl * w + tz / tl * (1 - w)
            wob = 0.22 * math.sin(step * 0.45 + k * 2.1)
            dx, dz = dx - dz * wob, dz + dx * wob
            dl = math.hypot(dx, dz) or 1.0
            x += dx / dl * 0.3
            z += dz / dl * 0.3
            pts.append((x, z))
            if G.y(x, z) < lake["water"] + 0.04 or abs(x) > L["half"] - 0.5 or abs(z) > L["half"] - 0.5 or flat > 40:
                break
        for _ in range(2):
            pts = [pts[0]] + [p for a, b in zip(pts, pts[1:]) for p in ((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))] + [pts[-1]]
        out.append(pts)
    return out


def near_path(x, z, paths, reach):
    """The distance from (x, z) to the nearest runoff path, if within `reach` (else None)."""
    best = None
    for pts in paths:
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            if min(ax, bx) - reach > x or max(ax, bx) + reach < x or min(az, bz) - reach > z or max(az, bz) + reach < z:
                continue
            vx, vz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz or 1.0)))
            d = math.hypot(x - ax - vx * t, z - az - vz * t)
            if d < reach and (best is None or d < best):
                best = d
    return best


def build_ground(G, L, ground, water, runoff=()):
    """The floor, which is also the walk collider (caverns_walk_collider): the walk grid's very
    triangles (the game's cavernsFloorY, triangle for triangle, so a click lands where it shows),
    painted by what they are; the rock slopes away from any footing roughened; the terraces' pools
    carved into it; the lake's water over its bed."""
    n = G.n
    pools = [pool_outline(G, pi, pi * 1.7 + 0.3) for pi in range(len(G.pools))]
    cols = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            q = k * n + i
            c = ground_colour(x, G.h[q], z, G.s[q], G.dist[q])
            if runoff and G.s[q] != 7:
                # the runoff's damp: darker, moss specks along it
                d = near_path(x, z, runoff, 0.7)
                if d is not None:
                    c = mixc(c, "damp", smooth(0.7, 0.1, d) * 0.6)
                    c = mixc(c, "mossDeep", smooth(0.7, 0.3, d) * smooth(0.2, 0.5, fbm(x * 3.3, 0.5, z * 3.3, 19)) * 0.6)
            cols.append(c)
    # (one light blur over the neighbours: a moss patch or a sand shore fades into the next)
    nxt = []
    for k in range(n):
        for i in range(n):
            acc = [0.0, 0.0, 0.0]
            wsum = 0.0
            for dk in (-1, 0, 1):
                for di in (-1, 0, 1):
                    ii, kk = i + di, k + dk
                    if 0 <= ii < n and 0 <= kk < n:
                        w = 4.0 if di == 0 and dk == 0 else 1.0
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
            if d > 0.3:
                hx = G.h[k * n + min(n - 1, i + 1)] - G.h[k * n + max(0, i - 1)]
                hz = G.h[min(n - 1, k + 1) * n + i] - G.h[max(0, k - 1) * n + i]
                steep = math.hypot(hx, hz) / (2 * G.cell)
                h += smooth(0.35, 1.0, steep) * smooth(0.3, 0.9, d) * (0.3 * fbm(x * 0.8, 0.0, z * 0.8, 31) + 0.14 * fbm(x * 2.2, 1.0, z * 2.2, 37))
            for pi, ((cx, cz, rx, rz), out) in enumerate(pools):
                if inside_poly(x, z, out):
                    h = min(h, G.pools[pi]["y"] - 0.38)
            v = ground.v(x, h, z)
            ground.setv(v, cols[q])
            verts.append(v)
    for k in range(n - 1):
        for i in range(n - 1):
            a, b = verts[k * n + i], verts[k * n + i + 1]
            c, dv = verts[(k + 1) * n + i], verts[(k + 1) * n + i + 1]
            for tri in ((a, dv, b), (a, c, dv)):
                ground.setsmooth(ground.face(tri, "limeFloor"))
    # the lake's surface over every cell its water shows in
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
            if min(hs) > wy - 0.02 or math.hypot((x - K["x"]) / K["rx"], (z - K["z"]) / K["rz"]) > 1.4:
                continue
            q = [wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)]
            water.setsmooth(water.face(q, "aqua"))


# ---------------------------------------------------------------------------------------------
# the geological pipeline: monolithic rough solids, Boolean-carved, voxel-remeshed into one seamless
# body, weathered by Voronoi pits and ridged-Musgrave strata, decimated into crisp low-poly facets


def sculpt(src, key, voxel=0.25, pits=0.3, strata=0.2, target=6000, ratio=None, solidify=None, carves=(), weight=None):
    """`src` (a Mesh of closed rough solids, or a sheet with `solidify` its thickness) as one body of
    rock; returns (verts, faces, normals) in game space. `carves`: bmeshes subtracted (Boolean
    DIFFERENCE) before the remesh; `weight(x, y, z)` 0..1: where the weathering may move the rock."""
    scene = bpy.context.scene
    bm = src.bm
    me = bpy.data.meshes.new(f"CV_{key}SculptMesh")
    bm.to_mesh(me)
    ob = bpy.data.objects.new(f"CV_{key}Sculpt", me)
    scene.collection.objects.link(ob)
    temp, textures, stats = [ob], [], {}

    def bake(o):
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        baked = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        old = o.data
        o.modifiers.clear()
        o.data = baked
        bpy.data.meshes.remove(old)

    try:
        if solidify:
            sol = ob.modifiers.new("Thicken", "SOLIDIFY")
            sol.thickness = solidify
            sol.offset = -1.0
            sol.use_even_offset = True
            sol.use_rim = True
            bake(ob)
        stats["solid_faces"] = len(ob.data.polygons)

        def remesh(tag):
            ob.data.remesh_voxel_size = voxel
            ob.data.remesh_voxel_adaptivity = 0.0
            try:
                with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
                    bpy.ops.object.voxel_remesh()
                stats[tag] = "voxel_remesh(%.2f)" % voxel
            except Exception as err:
                rm = ob.modifiers.new("Voxel", "REMESH")
                rm.mode = "VOXEL"
                rm.voxel_size = voxel
                bake(ob)
                stats[tag] = "Remesh VOXEL %.2f (%s)" % (voxel, str(err).splitlines()[0][:60])

        # (the monolith fused first into one clean manifold, so the Booleans cut true)
        if carves:
            remesh("fuse")
        # the Boolean carving: each volume subtracted from the monolith
        carved = 0
        for k, cb in enumerate(carves):
            cme = bpy.data.meshes.new(f"CV_{key}Carve{k}")
            cb.to_mesh(cme)
            cb.free()
            cut = bpy.data.objects.new(f"CV_{key}Carve{k}", cme)
            scene.collection.objects.link(cut)
            temp.append(cut)
            mod = ob.modifiers.new(f"Carve{k}", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            try:
                mod.solver = "EXACT"
            except Exception:
                pass
            mod.object = cut
            try:
                bake(ob)
                carved += 1
            except Exception as err:
                ob.modifiers.clear()
                stats[f"carve{k}"] = str(err).splitlines()[0][:80]
        stats["carved"] = carved
        # the voxel remesh: every piece fused into one seamless mantle of stone
        remesh("remesh")
        stats["remeshed_faces"] = len(ob.data.polygons)
        vg = ob.vertex_groups.new(name="Weathering")
        for vert in ob.data.vertices:
            w = weight(*_game(vert.co)) if weight else 1.0
            if w > 0.0:
                vg.add([vert.index], min(1.0, w), "REPLACE")
        # the limestone's pocks and knuckles
        pit = bpy.data.textures.new(f"CV_{key}Pits", "VORONOI")
        textures.append(pit)
        pit.distance_metric = "DISTANCE"
        pit.color_mode = "INTENSITY"
        pit.noise_scale = 1.6
        d1 = ob.modifiers.new("Pitting", "DISPLACE")
        d1.texture = pit
        d1.direction = "NORMAL"
        d1.strength = pits
        d1.mid_level = 0.5
        d1.vertex_group = vg.name
        # the strata: a ridged Musgrave stretched flat along the beds, its ridges running as ledges
        try:
            beds = bpy.data.textures.new(f"CV_{key}Strata", "MUSGRAVE")
            beds.musgrave_type = "RIDGED_MULTIFRACTAL"
            beds.octaves = 3.0
            stats["strata"] = "musgrave"
        except Exception:
            beds = bpy.data.textures.new(f"CV_{key}Strata", "STUCCI")
            stats["strata"] = "stucci"
        textures.append(beds)
        beds.noise_scale = 1.0
        frame = bpy.data.objects.new(f"CV_{key}StrataFrame", None)
        frame.scale = (5.0, 5.0, 0.45)
        scene.collection.objects.link(frame)
        temp.append(frame)
        d2 = ob.modifiers.new("Strata", "DISPLACE")
        d2.texture = beds
        d2.texture_coords = "OBJECT"
        d2.texture_coords_object = frame
        d2.direction = "NORMAL"
        d2.strength = strata
        d2.mid_level = 0.5
        d2.vertex_group = vg.name
        bake(ob)
        # crisp low-poly facets
        faces_now = len(ob.data.polygons)
        r = ratio if ratio is not None else max(0.01, min(1.0, target / max(1, faces_now)))
        dec = ob.modifiers.new("Facets", "DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = r
        dec.use_collapse_triangulate = True
        bake(ob)
        stats["decimate"] = round(r, 4)
        stats["faces"] = len(ob.data.polygons)
        rb = bmesh.new()
        rb.from_mesh(ob.data)
        rb.normal_update()
        verts = [_game(v.co) for v in rb.verts]
        normals = [(v.normal.x, v.normal.z, -v.normal.y) for v in rb.verts]
        faces = [[v.index for v in f.verts] for f in rb.faces]
        rb.free()
        stats["verts"] = len(verts)
    finally:
        for o in temp:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0:
                bpy.data.meshes.remove(data)
        for t in textures:
            bpy.data.textures.remove(t)
    GEO_STATS[key] = stats
    return verts, faces, normals


def emit(M, sculpted, colour, smooth_=True):
    """A sculpted body into the mesh `M`, each vertex coloured `colour(x, y, z, nx, ny, nz)`."""
    verts, faces, normals = sculpted
    made = []
    for (x, y, z), (nx, ny, nz) in zip(verts, normals):
        v = M.v(x, y, z)
        M.setv(v, colour(x, y, z, nx, ny, nz))
        made.append(v)
    for f in faces:
        try:
            face = M.face([made[i] for i in f], "limestone")
        except ValueError:
            continue
        if smooth_:
            M.setsmooth(face)


def tube(M, pts, radii, col, sides=5, rad=None, cap_end=True, closed=False, colours=None, cap_start=False):
    """A tube through the game points `pts` (radius `radii[i]`; or `rad(i, k)` for ring i, side k),
    its rings carried along the path (parallel transport, so it never twists), smooth; `closed`
    joins its last ring to its first."""
    rings = []
    prev = None
    count = len(pts)
    for i, p in enumerate(pts):
        if closed:
            a, b = W(*pts[(i - 1) % count]), W(*pts[(i + 1) % count])
        else:
            a, b = W(*pts[max(0, i - 1)]), W(*pts[min(count - 1, i + 1)])
        t = (b - a).normalized()
        n = t.orthogonal().normalized() if prev is None else (prev - t * prev.dot(t)).normalized()
        q = t.cross(n)
        prev = n
        c = W(*p)
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            r = rad(i, k) if rad else radii[i]
            v = M.bm.verts.new(c + (n * math.cos(ang) + q * math.sin(ang)) * r)
            M.setv(v, colours[i] if colours else col)
            ring.append(v)
        rings.append(ring)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in pairs:
        for k in range(sides):
            k1 = (k + 1) % sides
            M.setsmooth(M.face((r0[k], r0[k1], r1[k1], r1[k]), col))
    if cap_start and not closed:
        back = M.bm.verts.new(W(*pts[0]) - (W(*pts[1]) - W(*pts[0])).normalized() * radii[0] * 0.5)
        M.setv(back, colours[0] if colours else col)
        for k in range(sides):
            M.setsmooth(M.face((rings[0][(k + 1) % sides], rings[0][k], back), col))
    if cap_end and not closed:
        tip = M.bm.verts.new(W(*pts[-1]) + (W(*pts[-1]) - W(*pts[-2])).normalized() * radii[-1] * 0.5)
        M.setv(tip, colours[-1] if colours else col)
        for k in range(sides):
            M.setsmooth(M.face((rings[-1][k], rings[-1][(k + 1) % sides], tip), col))


def dripstone(M, x, y, z, r, h, rng, up=True, flutes=6, rings=4, base="limestone", tip="flowstone"):
    """A fluted speleothem (a stalagmite `up`, a stalactite down): its flutes' ridges and grooves
    tapering to a point, leaning a little, flowstone-pale toward its tip."""
    sg = 1 if up else -1
    lx, lz = (rng.random() - 0.5) * 0.18 * h, (rng.random() - 0.5) * 0.18 * h
    phase = rng.random() * 6.28
    pts, radii, cols = [], [], []
    rings = rings + 2
    for j in range(rings + 1):
        t = j / rings
        pts.append((x + lx * t * t, y + sg * h * t * 0.96, z + lz * t * t))
        # (a candle of flowstone: stout, bulging where the drip thickened it, blunt at its tip)
        radii.append(r * (1 - 0.74 * t ** 1.15) * (1 + 0.13 * math.sin(t * 7.0 + phase)) + 0.01)
        cols.append(mixc(base, tip, t))
    pts.append((x + lx, y + sg * h * 1.02, z + lz))
    radii.append(r * 0.14)
    cols.append(lin(tip) if isinstance(tip, str) else tip)
    twist = rng.random() * 6.28

    def rad(i, k):
        return radii[i] * (1.0 if k % 2 == 0 else 0.7) * (1 + 0.08 * math.sin(twist + i * 1.7 + k))

    tube(M, pts, radii, base, sides=flutes * 2, rad=rad, cap_end=True, colours=cols)


def dripstone_cluster(M, x, y, z, r, h, rng, up=True, base="limestone", tip="flowstone"):
    """One big dripstone and its brood crowded round its foot (never a lone cone)."""
    dripstone(M, x, y, z, r, h, rng, up=up, base=base, tip=tip)
    for k in range(2 + int(rng.random() * 2)):
        a = rng.random() * 6.28
        d = r * (0.9 + 0.6 * rng.random())
        s = 0.3 + 0.35 * rng.random()
        dripstone(M, x + math.cos(a) * d, y, z + math.sin(a) * d, r * s * 1.2, h * s, rng, up=up, flutes=5, rings=3, base=base, tip=tip)


def angular(M, x, y, z, r, h, rng, top, side, sink=0.2, squash=0.85, npts=12):
    """A fractured limestone block: an angular hull, flat faceted faces, lighter where it faces up."""
    for f in chunk(M, r, h, rng, sink=sink, squash=squash, at=(x, y, z), npts=npts):
        f.normal_update()
        M.setf(f, top if f.normal.z > 0.45 else side)


# ---------------------------------------------------------------------------------------------
# the shell: the walls' sheet, carved and sculpted into the living rock


WEST_RISE = 2.8  # the west cliff stands this much taller: a buffer of limestone, sealed


def wall_point(G, L, along, u, v, rng_seed):
    """A point on the shell: `along` "x" the north wall (u its x), "z" the west (u its z); v 0 at its
    foot on the ground, 1 at its top, curving in over the floor near the top into the vault (broken
    open over the doline, where the sun comes in); bulging in and out, pocketed."""
    half = L["half"]
    top = L["walls"]["height"] + (WEST_RISE if along == "z" else 0.0)
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
    edge = 2.4 * fbm(x * 0.25, y * 0.2, z * 0.25, 59)
    if (along == "z" and z < -8.0 + edge) or (along == "x" and x < -13.0 + edge):
        c = mixc(c, "slate", 0.55)
        c = mixc(c, "slateMoss", max(0.0, fbm(x * 1.3, y * 1.3, z * 1.3, 53)) * 0.8 * (1 - smooth(0.2, 0.5, v)))
    elif along == "x" and x > 13.0:
        c = mixc(c, "shellCold", 0.6)
    elif along == "x" and -10 < x < 12 and v < 0.6:
        # the doline's walls: moss and ivy in layers under the sun
        c = mixc(c, "mossDeep", smooth(-0.05, 0.3, fbm(x * 1.1, y * 0.9, z, 55)) * 0.85)
        c = mixc(c, "mossLime", smooth(0.3, 0.55, fbm(x * 2.3, y * 2.0, z, 57)) * 0.5)
    return c


def _shell_frame(G, L, x, y, z):
    """Which wall a point of the rock belongs to ("x" the north, "z" the west) and how far up it."""
    half = L["half"]
    along = "x" if z <= x else "z"
    gx, gz = (x, -half + 0.4) if along == "x" else (-half + 0.4, z)
    foot = G.y(max(-half, min(half, gx)), max(-half, min(half, gz))) - 0.5
    top = L["walls"]["height"] + (WEST_RISE if along == "z" else 0.0)
    return along, max(0.0, min(1.0, (y - foot) / max(0.1, top - foot)))


def _weathering(G, L, x, y, z):
    """Where the strata may move the shell: not at its foot (the walk's edge stays where the grid
    put it), nor round the adit's mouth and the forge's fissure (their timbers and basalt fit)."""
    half = L["half"]
    w = smooth(0.04, 0.22, _shell_frame(G, L, x, y, z)[1])
    for o, extra in ((L["adit"], 0.4), (L["forge"], 0.9)):
        oy = G.y(o["x"], max(-half + 1.0, o["z"]))
        near = max(abs(x - o["x"]) - o["w"] / 2 - 0.3, y - (oy + o["h"] + extra), abs(z + half) - 2.4)
        w *= smooth(0.0, 1.4, near)
    return w


def arch_half_width(A, y, dy):
    """The adit's rock-cut arch: its half-width at height `y` (straight sides, then a round head)."""
    spring = dy + A["h"] - A["w"] / 2
    if y <= spring:
        return A["w"] / 2 + 0.3
    t = (y - spring) / (A["w"] / 2 + 0.3)
    return (A["w"] / 2 + 0.3) * math.sqrt(max(0.0, 1 - t * t))


def carve_box(x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    vs = [bm.verts.new(W(x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    bmesh.ops.convex_hull(bm, input=vs)
    return bm


def build_shell(G, L, shell, glow, rock, roots, rng):
    """The north and west walls and their vault as living rock (carved, remeshed, weathered), the
    adit's rock-cut arch, the forge's fissure, fluted dripstone in the vault's pockets, and the
    aerial vines hanging from the doline's broken roof."""
    half = L["half"]
    A = L["adit"]
    F = L["forge"]
    V = 22
    us = frange(-half - 0.5, half, 0.5)
    ady = G.y(A["x"], -half + 1.0)
    fdy = G.y(F["x"], F["z"])
    wall = Mesh("CV_Shell")
    for along in ("x", "z"):
        grid = []
        for u in us:
            grid.append([wall.v(*wall_point(G, L, along, u, j / V, 0)) for j in range(V + 1)])
        for a in range(len(us) - 1):
            for j in range(V):
                u0, u1 = us[a], us[a + 1]
                y0, y1 = grid[a][j].co.z, grid[a][j + 1].co.z
                if along == "x":
                    um = (u0 + u1) / 2
                    ym = (y0 + y1) / 2
                    # (the adit's arch and the forge's cleft open in the north wall)
                    if abs(um - A["x"]) < arch_half_width(A, ym, ady) and ym > ady - 1.0:
                        continue
                    if abs(um - F["x"]) < F["w"] / 2 + 0.25 - 0.12 * max(0.0, ym - fdy - F["h"]) and ym < fdy + F["h"] + 1.4:
                        continue
                q = (grid[a][j], grid[a + 1][j], grid[a + 1][j + 1], grid[a][j + 1])
                wall.face(q if along == "x" else tuple(reversed(q)), "shell")
    # the sheet faces the cavern; its thickness goes out behind it, into the hill
    eye = Vector(W(0.0, 2.0, 0.0))
    wall.bm.normal_update()
    if sum(f.normal.dot(eye - f.calc_center_median()) for f in wall.bm.faces) < 0:
        bmesh.ops.reverse_faces(wall.bm, faces=wall.bm.faces[:])
    # carved by Booleans: the adit's tunnel and the forge's cleft cut clean into the monolith
    carves = [
        carve_box(A["x"] - A["w"] / 2 - 0.2, A["x"] + A["w"] / 2 + 0.2, ady - 0.6, ady + A["h"] - 0.2, -half - 4.0, -half + 1.6),
        carve_box(F["x"] - F["w"] / 2 - 0.1, F["x"] + F["w"] / 2 + 0.1, fdy - 0.6, fdy + F["h"] + 0.9, -half - 3.0, -half + 1.4),
    ]
    body = sculpt(wall, "Shell", voxel=0.3, pits=0.5, strata=0.32, target=5200, solidify=1.2, carves=carves, weight=lambda x, y, z: _weathering(G, L, x, y, z))

    def shell_col(x, y, z, nx, ny, nz):
        along, v = _shell_frame(G, L, x, y, z)
        return wall_colour(x, y, z, v, along)

    emit(shell, body, shell_col)
    # fluted dripstone clusters nested up in the vault's pockets (never a row of them)
    spots = []
    for k in range(60):
        along = "x" if rng.random() < 0.55 else "z"
        u = -half + 2.0 + rng.random() * (2 * half - 4.0)
        if along == "x" and -9.5 < u < 11.5:
            continue
        if any(a == along and abs(u - b) < 4.0 for a, b in spots):
            continue
        spots.append((along, u))
        if len(spots) >= 9:
            break
    for along, u in spots:
        p = wall_point(G, L, along, u, 0.64 + 0.06 * rng.random(), 0)
        back = 0.35
        bx, by, bz = (p[0], p[1] + 0.3, p[2] - back) if along == "x" else (p[0] - back, p[1] + 0.3, p[2])
        dripstone_cluster(shell, bx, by, bz, 0.16 + 0.1 * rng.random(), 0.9 + 1.4 * rng.random(), rng, up=False, base="vault", tip="flowstone")
    # the aerial vines: hanging from the lip of the doline's broken roof, swaying into the sunlight
    for k in range(16):
        u = -8.5 + 18.5 * k / 15 + (rng.random() - 0.5) * 0.8
        p = wall_point(G, L, "x", u, 0.97, 0)
        ln = 2.2 + 3.2 * rng.random()
        pts = []
        for j in range(6):
            t = j / 5
            pts.append((p[0] + 0.25 * math.sin(t * 3 + k), p[1] - ln * t, p[2] + 0.35 * t + 0.15 * math.sin(t * 5 + k)))
        tube(roots, pts, [0.035 * (1 - 0.6 * j / 5) + 0.01 for j in range(6)], "vine", sides=4, cap_end=True, colours=[mixc("vine", "vineLight", j / 5) for j in range(6)])
        for j in range(1, 6):
            x, y, z = pts[j]
            s = 0.16 + 0.1 * rng.random()
            a = rng.random() * 6.28
            tri = [(x, y, z), (x + math.cos(a) * s, y - 0.06, z + math.sin(a) * s), (x + math.cos(a + 0.6) * s * 0.7, y - 0.14, z + math.sin(a + 0.6) * s * 0.7)]
            roots.face([roots.v(*p) for p in tri], "vineLight" if j % 2 else "mossMid")
            roots.face([roots.v(p[0], p[1] - 0.01, p[2]) for p in reversed(tri)], "vine")
    # the adit: the tunnel's dark bore into the hill (its arch profile, darker the deeper it goes),
    # timber sets propping its mouth, lagging over their caps, the rails running out on sleepers,
    # a lantern hung from the first cap, the rubble of its cutting heaped either side
    hw = A["w"] / 2
    prof = [(-hw, ady - 0.1), (-hw, ady + A["h"] - hw)] + [(-hw * math.cos(math.pi * k / 6), ady + A["h"] - hw + hw * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(hw, ady + A["h"] - hw), (hw, ady - 0.1)]
    depths = [-half + 1.1, -half - 0.4, -half - 1.8, -half - 3.2]
    rings_ = []
    for j, zz in enumerate(depths):
        ring = []
        for px, py in prof:
            v = rock.v(A["x"] + px * (1 - 0.06 * j), py, zz)
            rock.setv(v, mixc("stoneDark", "tunnel", j / (len(depths) - 1) * 1.2))
            ring.append(v)
        rings_.append(ring)
    for r0, r1 in zip(rings_, rings_[1:]):
        for k in range(len(prof) - 1):
            rock.setsmooth(rock.face((r0[k + 1], r0[k], r1[k], r1[k + 1]), "tunnel"))
    back = rings_[-1]
    rock.face(list(reversed(back)), "tunnel")
    for j, zz in enumerate((-half + 0.9, -half - 0.5, -half - 1.9)):
        sp = 0.06 * j
        for sx in (-1, 1):
            px = A["x"] + sx * (hw - 0.05 - sp)
            box(rock, px - 0.1, px + 0.1, ady - 0.1, ady + A["h"] - hw + 0.25, zz - 0.1, zz + 0.1, "timber" if j == 0 else "timberDark")
        box(rock, A["x"] - hw - 0.12 + sp, A["x"] + hw + 0.12 - sp, ady + A["h"] - hw + 0.22, ady + A["h"] - hw + 0.42, zz - 0.12, zz + 0.12, "timberDark")
    for k in range(6):
        zz = -half + 0.95 - k * 0.42
        box(rock, A["x"] - hw + 0.1, A["x"] + hw - 0.1, ady + A["h"] - hw + 0.42, ady + A["h"] - hw + 0.48, zz - 0.17, zz + 0.17, "plank" if k % 2 else "timber", bottom=False)
    for k in range(9):
        zz = -half - 2.8 + k * 0.62
        box(rock, A["x"] - 0.62, A["x"] + 0.62, ady - 0.02, ady + 0.04, zz - 0.09, zz + 0.09, "timberDark", bottom=False)
    for sx in (-0.42, 0.42):
        box(rock, A["x"] + sx - 0.03, A["x"] + sx + 0.03, ady + 0.04, ady + 0.1, -half - 3.0, -half + 2.8, "steel", bottom=False)
    ly = ady + A["h"] - hw + 0.1
    cyl(rock, (A["x"] + hw - 0.3, ly + 0.25, -half + 1.02), (A["x"] + hw - 0.3, ly - 0.1, -half + 1.02), 0.012, "iron", sides=4)
    lathe(glow, A["x"] + hw - 0.3, -half + 1.02, [(0, 0), (0.07, 0.02), (0.09, 0.12), (0.07, 0.22), (0, 0.24)], "lanternHot", segs=8, y0=ly - 0.36)
    for k in range(10):
        sx = -1 if k % 2 else 1
        x = A["x"] + sx * (hw + 0.6 + 0.9 * rng.random())
        z = -half + 1.3 + 0.9 * rng.random()
        angular(rock, x, G.y(x, z), z, 0.18 + 0.2 * rng.random(), 0.25 + 0.2 * rng.random(), rng, "limeCool", "limestoneDark")


# ---------------------------------------------------------------------------------------------
# the Expedition Basecamp, the forge in its basalt cleft, the meteorite anvil


def tarp(M, corners, sag, col, under):
    """A canvas sheet sagging between its four corners (both faces: seen from above and below)."""
    (ax, ay, az), (bx, by, bz), (cx, cy, cz), (dx, dy, dz) = corners
    N, K = 5, 3
    grid = []
    for i in range(N + 1):
        u = i / N
        row = []
        for k in range(K + 1):
            v = k / K
            x = (ax * (1 - u) + bx * u) * (1 - v) + (dx * (1 - u) + cx * u) * v
            y = (ay * (1 - u) + by * u) * (1 - v) + (dy * (1 - u) + cy * u) * v - sag * math.sin(math.pi * u) * math.sin(math.pi * v)
            z = (az * (1 - u) + bz * u) * (1 - v) + (dz * (1 - u) + cz * u) * v
            row.append((x, y, z))
        grid.append(row)
    top = [[M.v(*p) for p in row] for row in grid]
    bot = [[M.v(p[0], p[1] - 0.015, p[2]) for p in row] for row in grid]
    for i in range(N):
        for k in range(K):
            q = (top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1])
            f = M.face(q, col)
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
            g = M.face((bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k], bot[i][k]), under)
            g.normal_update()
            if g.normal.z > 0:
                g.normal_flip()


def lantern(rock, glow, x, y, z, hang=0.3):
    """An oil lantern hung from its hook: the wire, the glowing globe, its cap."""
    cyl(rock, (x, y, z), (x, y - hang, z), 0.01, "iron", sides=4)
    lathe(glow, x, z, [(0, 0), (0.06, 0.02), (0.08, 0.1), (0.06, 0.19), (0, 0.2)], "lanternHot", segs=8, y0=y - hang - 0.2)
    lathe(rock, x, z, [(0, 0), (0.07, 0.0), (0.03, 0.05), (0, 0.06)], "iron", segs=6, y0=y - hang)


def build_outpost(G, L, rock, glow, water, rng):
    half = L["half"]
    F = L["forge"]
    Wk = L["workstation"]
    wy = G.y(Wk["x"], Wk["z"])
    Cp = L["camp"]
    # Gus's log workstation (the counter he trades over)
    for sx in (-1, 1):
        cyl(rock, (Wk["x"] + sx * Wk["len"] * 0.36, wy - 0.05, Wk["z"]), (Wk["x"] + sx * Wk["len"] * 0.36, wy + Wk["top"] - 0.16, Wk["z"]), 0.22, "timberDark", sides=9)
    cyl(rock, (Wk["x"] - Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), (Wk["x"] + Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), Wk["w"] * 0.5, "timber", sides=9)
    box(rock, Wk["x"] - Wk["len"] / 2 + 0.05, Wk["x"] + Wk["len"] / 2 - 0.05, wy + Wk["top"] - 0.12, wy + Wk["top"], Wk["z"] - Wk["w"] * 0.42, Wk["z"] + Wk["w"] * 0.42, "plank", bottom=False)
    for k, colr in enumerate(("copperNug", "silverVein", "coalChunk", "copperNug")):
        blob(rock, Wk["x"] - 0.42 + k * 0.1, wy + Wk["top"] + 0.05, Wk["z"] - 0.02, 0.04, 0.035, 0.04, colr, cuts=0)
    # a loupe and a rock hammer on the bench, a ledger
    box(rock, Wk["x"] + 0.3, Wk["x"] + 0.62, wy + Wk["top"], wy + Wk["top"] + 0.03, Wk["z"] - 0.12, Wk["z"] + 0.12, "leather")
    cyl(rock, (Wk["x"] - 0.9, wy + Wk["top"] + 0.03, Wk["z"] + 0.1), (Wk["x"] - 0.62, wy + Wk["top"] + 0.03, Wk["z"] - 0.05), 0.018, "timber", sides=5)
    box(rock, Wk["x"] - 0.66, Wk["x"] - 0.58, wy + Wk["top"] + 0.01, wy + Wk["top"] + 0.06, Wk["z"] - 0.1, Wk["z"] + 0.0, "iron")
    # the tarp shelter: four weathered posts, a ridge beam and eaves, the canvas stretched over
    posts = Cp["posts"]
    ridge, eave = Cp["ridge"], Cp["eave"]
    tops = []
    for k, (px, pz) in enumerate(posts):
        py = G.y(px, pz)
        ht = ridge if k < 2 else eave
        cyl(rock, (px, py - 0.1, pz), (px, py + ht, pz), 0.07, "timber" if k % 2 else "timberDark", sides=6)
        tops.append((px, py + ht, pz))
    cyl(rock, (tops[0][0], tops[0][1], tops[0][2]), (tops[1][0], tops[1][1], tops[1][2]), 0.06, "timberDark", sides=6)
    cyl(rock, (tops[2][0], tops[2][1], tops[2][2]), (tops[3][0], tops[3][1], tops[3][2]), 0.05, "timber", sides=6)
    for a, b in ((0, 2), (1, 3)):
        cyl(rock, tops[a], tops[b], 0.045, "timber", sides=5)
    tarp(rock, [(tops[0][0] - 0.25, tops[0][1] + 0.08, tops[0][2] + 0.2), (tops[1][0] + 0.25, tops[1][1] + 0.08, tops[1][2] + 0.2), (tops[3][0] + 0.25, tops[3][1] + 0.05, tops[3][2] - 0.25), (tops[2][0] - 0.25, tops[2][1] + 0.05, tops[2][2] - 0.25)], 0.16, "canvas", "canvasShade")
    # guy ropes out to pegs
    for (px, py, pz), (gx, gz) in zip(tops[2:], ((-0.9, -0.6), (0.9, -0.6))):
        ex, ez = px + gx, pz + gz
        cyl(rock, (px, py, pz), (ex, G.y(ex, ez) + 0.05, ez), 0.008, "cloth", sides=3, cap=False)
    # the lanterns hung from the ridge beam
    for t in (0.22, 0.78):
        x = tops[0][0] + (tops[1][0] - tops[0][0]) * t
        lantern(rock, glow, x, tops[0][1] - 0.06, tops[0][2], hang=0.28)
    # the crate stack, iron-strapped, the specimen jars on it glowing with their finds
    cx, cz = Cp["crates"]
    cy = G.y(cx, cz)
    for (dx, dz, w, d, h, y0) in ((-0.2, 0.0, 0.55, 0.5, 0.45, 0.0), (0.28, 0.02, 0.45, 0.45, 0.4, 0.0), (-0.12, 0.02, 0.5, 0.45, 0.38, 0.45)):
        x0, z0 = cx + dx - w / 2, cz + dz - d / 2
        box(rock, x0, x0 + w, cy + y0 - 0.02, cy + y0 + h, z0, z0 + d, "timber", top="plank")
        for sx in (0.12, w - 0.12):
            box(rock, x0 + sx - 0.025, x0 + sx + 0.025, cy + y0 - 0.02, cy + y0 + h + 0.004, z0 - 0.004, z0 + d + 0.004, "iron")
    jy = cy + 0.83
    for k, g in enumerate(("cyan", "copperGlow", "violet")):
        jx = cx - 0.3 + k * 0.17
        lathe(rock, jx, cz + 0.08, [(0, 0), (0.05, 0.0), (0.055, 0.12), (0.035, 0.15), (0, 0.16)], "glass", segs=7, y0=jy)
        blob(glow, jx, jy + 0.06, cz + 0.08, 0.03, 0.04, 0.03, g, cuts=0)
    # the brass survey transit on its tripod, sighting down the doline
    tx, tz = Cp["transit"]
    ty = G.y(tx, tz)
    head = (tx, ty + 1.15, tz)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        cyl(rock, (tx + math.cos(a) * 0.42, ty - 0.05, tz + math.sin(a) * 0.42), head, 0.02, "timber", sides=5)
    box(rock, tx - 0.07, tx + 0.07, ty + 1.12, ty + 1.2, tz - 0.07, tz + 0.07, "brassDark")
    cyl(rock, (tx, ty + 1.2, tz), (tx, ty + 1.3, tz), 0.035, "brass", sides=8)
    cyl(rock, (tx - 0.02, ty + 1.34, tz - 0.16), (tx + 0.02, ty + 1.36, tz + 0.2), 0.035, "brass", sides=8)
    cyl(rock, (tx, ty + 1.34, tz + 0.2), (tx, ty + 1.36, tz + 0.23), 0.045, "brassDark", sides=8)
    cyl(rock, (tx, ty + 1.1, tz), (tx, ty + 0.55, tz), 0.004, "iron", sides=3, cap=False)
    cone(rock, (tx, ty + 0.58, tz), (tx, ty + 0.48, tz), 0.025, "brass", sides=6)
    # a bedroll and a coil of rope by the crates
    cyl(rock, (cx + 0.9, G.y(cx + 0.9, cz + 0.5) + 0.1, cz + 0.4), (cx + 1.8, G.y(cx + 1.8, cz + 0.5) + 0.1, cz + 0.4), 0.13, "redCloth", sides=8)

    # the Basalt Crucible Forge: columnar basalt stepping up round the cleft in the north wall; in the
    # cleft a deep combustion chamber carved into the columns, embers glowing at its foot and its heat
    # rising up its back; before it the smelting hearth carved from one block (an arched fire-mouth,
    # runic vents, a crucible in its top), a stone spout running molten metal into an ingot mould,
    # the quench trough, the bellows at its flank; charcoal grit and slag round its base
    F = L["forge"]
    fy = G.y(F["x"], F["z"] + F["d"] / 2 + 0.3)
    fx0, fx1 = F["x"] - F["w"] / 2, F["x"] + F["w"] / 2
    cols = []
    for k in range(14):
        side = -1 if k % 2 == 0 else 1
        j = k // 2
        row = j % 2
        cx_ = (fx0 - 0.15 - 0.36 * j) if side < 0 else (fx1 + 0.15 + 0.36 * j)
        cz_ = -half + 0.5 + 0.42 * row + 0.12 * rng.random()
        ht = max(0.5, F["h"] + 1.9 - 0.62 * j + 1.1 * rng.random() - 0.5 * row)
        cols.append((cx_, cz_, 0.3 + 0.07 * rng.random(), ht))
    for k, (cx_, cz_, r_, ht) in enumerate(cols):
        prism_col(rock, (cx_, fy - 0.3, cz_), r_, ht, "basaltDeep" if k % 3 else "basalt")
    # the combustion chamber: a tall U of basalt slabs, its inner back glowing from the embers up
    chx0, chx1 = F["x"] - 0.72, F["x"] + 0.72
    chz = -half - 0.15
    top_ = fy + F["h"] + 0.6
    for x0_, x1_ in ((chx0 - 0.3, chx0), (chx1, chx1 + 0.3)):
        box(rock, x0_, x1_, fy - 0.2, top_, chz - 0.3, F["z"] - 0.35, "basaltDeep", top="basalt")
    box(rock, chx0 - 0.3, chx1 + 0.3, top_ - 0.25, top_ + 0.2, chz - 0.3, F["z"] - 0.45, "basalt")
    # the smelting chamber's arch: voussoirs of dressed basalt over its mouth, springing from the
    # chamber's jambs, the keystone lit from below
    az0, az1 = F["z"] - 0.62, F["z"] - 0.32
    spring = fy + 1.25
    Ri, Ro = (chx1 - chx0) / 2 + 0.02, (chx1 - chx0) / 2 + 0.34
    nseg = 9
    for k in range(nseg):
        a0, a1 = math.pi * k / nseg, math.pi * (k + 1) / nseg
        pts = []
        for a in (a0, a1):
            for rr in (Ri, Ro):
                for zz in (az0, az1):
                    pts.append((F["x"] + rr * math.cos(a), spring + rr * math.sin(a), zz))
        colr = "basaltLight" if k == nseg // 2 else ("basalt" if k % 2 else "basaltDeep")
        v = [rock.v(*q) for q in pts]
        # (the eight corners: [a][r][z]; the six faces of the voussoir)
        for quad in ((0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5), (0, 2, 3, 1), (4, 5, 7, 6)):
            f = rock.face([v[i] for i in quad], colr)
            f.normal_update()
            c_ = f.calc_center_median()
            mid = Vector(W(F["x"] + (Ri + Ro) / 2 * math.cos((a0 + a1) / 2), spring + (Ri + Ro) / 2 * math.sin((a0 + a1) / 2), (az0 + az1) / 2))
            if f.normal.dot(c_ - mid) < 0:
                f.normal_flip()
    # the jambs the arch springs from
    for jx in (chx0 - 0.34, chx1 + 0.02):
        box(rock, jx, jx + 0.32, fy - 0.1, spring, az0, az1, "basaltDeep", top="basalt")
    # the runic exhaust vents: slits glowing up the jambs' faces
    for jx in (chx0 - 0.18, chx1 + 0.18):
        for k in range(3):
            y0_ = fy + 0.35 + 0.3 * k
            q = [glow.v(jx - 0.025, y0_, az1 + 0.012), glow.v(jx + 0.025, y0_, az1 + 0.012), glow.v(jx + 0.025, y0_ + 0.18, az1 + 0.012), glow.v(jx - 0.025, y0_ + 0.18, az1 + 0.012)]
            f = glow.face(q, "runeFire" if k != 1 else "ember")
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
    rings = []
    for yy, colr in ((fy + 0.2, "forgeCore"), (fy + 0.9, "magmaHot"), (fy + 1.8, "ember"), (fy + 2.8, "emberDeep"), (top_ - 0.3, "basaltDeep")):
        a_ = glow.v(chx0 + 0.02, yy, chz + 0.02)
        b_ = glow.v(chx1 - 0.02, yy, chz + 0.02)
        glow.setv(a_, colr)
        glow.setv(b_, colr)
        rings.append((a_, b_))
    for (a0, b0), (a1, b1) in zip(rings, rings[1:]):
        f = glow.face((a0, b0, b1, a1), "ember")
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    for k in range(9):
        blob(glow, F["x"] + (rng.random() - 0.5) * 1.1, fy + 0.12 + 0.06 * rng.random(), chz + 0.25 + 0.4 * rng.random(), 0.09, 0.05, 0.08, "magmaHot" if k % 2 else "forgeCore", cuts=0)
    # the hearth: one carved block, bevelled, before the chamber
    hx0, hx1 = F["x"] - 0.62, F["x"] + 0.62
    hz0, hz1 = F["z"] - 0.35, F["z"] + 0.55
    hy = fy + 0.85
    box(rock, hx0 - 0.07, hx1 + 0.07, fy - 0.1, fy + 0.14, hz0 - 0.05, hz1 + 0.07, "basalt", top="basaltLight")
    box(rock, hx0, hx1, fy + 0.14, hy - 0.08, hz0, hz1, "stoneDark", top="basaltLight")
    for qx in (hx0 - 0.015, hx1 - 0.105):
        for k in range(3):
            box(rock, qx, qx + 0.12, fy + 0.16 + 0.22 * k, fy + 0.34 + 0.22 * k, hz1 - 0.12, hz1 + 0.015, "basaltLight" if k % 2 else "basalt")
    box(rock, hx0 - 0.05, hx1 + 0.05, hy - 0.08, hy, hz0 - 0.03, hz1 + 0.05, "basaltLight")
    # its fire-mouth: an arch of embers in the front face, a dark lintel over it
    mz = hz1 + 0.012
    arch = [(F["x"] - 0.26, fy + 0.08), (F["x"] - 0.26, fy + 0.34)] + [(F["x"] - 0.26 * math.cos(math.pi * k / 6), fy + 0.34 + 0.2 * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(F["x"] + 0.26, fy + 0.34), (F["x"] + 0.26, fy + 0.08)]
    mid = glow.v(F["x"], fy + 0.22, mz)
    glow.setv(mid, "forgeCore")
    av = []
    for ax_, ay_ in arch:
        v = glow.v(ax_, ay_, mz)
        glow.setv(v, "ember")
        av.append(v)
    for a0, a1 in zip(av, av[1:]):
        f = glow.face((mid, a0, a1), "ember")
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    box(rock, F["x"] - 0.34, F["x"] + 0.34, fy + 0.56, fy + 0.64, hz1, hz1 + 0.05, "basaltDeep")
    # the runic vents either side of the mouth: slits glowing in rune shapes
    for sx in (-1, 1):
        for k, ((ax_, ay_), (bx_, by_)) in enumerate((((0.0, 0.0), (0.0, 0.3)), ((-0.06, 0.2), (0.06, 0.1)), ((-0.05, 0.06), (0.05, 0.12)))):
            cx_ = F["x"] + sx * 0.46
            base_y = fy + 0.2
            dx, dy = bx_ - ax_, by_ - ay_
            ln = math.hypot(dx, dy) or 1
            ox, oy = -dy / ln * 0.014, dx / ln * 0.014
            q = [glow.v(cx_ + ax_ + ox, base_y + ay_ + oy, mz), glow.v(cx_ + ax_ - ox, base_y + ay_ - oy, mz), glow.v(cx_ + bx_ - ox, base_y + by_ - oy, mz), glow.v(cx_ + bx_ + ox, base_y + by_ + oy, mz)]
            f = glow.face(q, "runeFire")
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
    # the crucible sunk in its top, molten metal in it
    lathe(rock, F["x"], F["z"] + 0.1, [(0, 0), (0.3, 0.0), (0.34, 0.1), (0.27, 0.12), (0, 0.02)], "stoneDark", segs=10, y0=hy - 0.02)
    lathe(glow, F["x"], F["z"] + 0.1, [(0, 0), (0.24, 0.0), (0.24, 0.01), (0, 0.015)], "magmaHot", segs=10, y0=hy + 0.07)
    # the runoff spout: a stone channel out of the hearth's left flank, a thread of molten metal
    # running down it into the ingot mould
    sx0 = hx0
    cyl(rock, (sx0 + 0.05, hy - 0.2, F["z"] + 0.25), (sx0 - 0.42, hy - 0.42, F["z"] + 0.3), 0.07, "stoneDark", sides=6)
    cyl(glow, (sx0 + 0.02, hy - 0.16, F["z"] + 0.25), (sx0 - 0.4, hy - 0.37, F["z"] + 0.3), 0.022, "magmaHot", sides=5)
    cyl(glow, (sx0 - 0.42, hy - 0.38, F["z"] + 0.3), (sx0 - 0.46, fy + 0.33, F["z"] + 0.3), 0.014, "magma", sides=4)
    mx0 = sx0 - 0.72
    box(rock, mx0, mx0 + 0.52, fy - 0.05, fy + 0.3, F["z"] + 0.08, F["z"] + 0.52, "basalt", top="stoneDark")
    box(glow, mx0 + 0.1, mx0 + 0.42, fy + 0.3, fy + 0.32, F["z"] + 0.2, F["z"] + 0.4, "magma", bottom=False)
    # the quench trough carved in a basalt block, dark water in it, tongs across it
    tx0, tx1 = hx1 + 0.12, hx1 + 0.78
    tz0, tz1 = F["z"] + 0.02, F["z"] + 0.58
    box(rock, tx0, tx1, fy - 0.05, fy + 0.42, tz0, tz1, "basalt", top="basaltLight")
    box(rock, tx0 + 0.06, tx1 - 0.06, fy + 0.3, fy + 0.425, tz0 + 0.06, tz1 - 0.06, "tunnel", bottom=False)
    q = [water.v(tx0 + 0.07, fy + 0.36, tz0 + 0.07), water.v(tx0 + 0.07, fy + 0.36, tz1 - 0.07), water.v(tx1 - 0.07, fy + 0.36, tz1 - 0.07), water.v(tx1 - 0.07, fy + 0.36, tz0 + 0.07)]
    for v in q:
        water.setv(v, "waterDark")
    f = water.face(q, "waterDark")
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    cyl(rock, (tx0 + 0.05, fy + 0.46, tz0 + 0.2), (tx1 - 0.05, fy + 0.46, tz0 + 0.3), 0.012, "iron", sides=4)
    cyl(rock, (tx0 + 0.05, fy + 0.46, tz0 + 0.28), (tx1 - 0.05, fy + 0.46, tz0 + 0.38), 0.012, "iron", sides=4)
    # the bellows at the hearth's right flank, their nozzle into it
    bx0 = hx1 + 0.12
    bz0 = F["z"] - 0.62
    box(rock, bx0, bx0 + 0.62, fy + 0.3, fy + 0.4, bz0, bz0 + 0.5, "timber")
    box(rock, bx0 + 0.03, bx0 + 0.59, fy + 0.4, fy + 0.58, bz0 + 0.03, bz0 + 0.47, "leather")
    box(rock, bx0, bx0 + 0.62, fy + 0.58, fy + 0.68, bz0, bz0 + 0.5, "timber")
    cyl(rock, (bx0 + 0.02, fy + 0.48, bz0 + 0.25), (hx1 - 0.02, fy + 0.4, bz0 + 0.3), 0.035, "iron", sides=6)
    for k in range(2):
        cyl(rock, (bx0 + 0.15 + 0.3 * k, fy - 0.05, bz0 + 0.1), (bx0 + 0.15 + 0.3 * k, fy + 0.3, bz0 + 0.1), 0.04, "timberDark", sides=5)
    # charcoal grit and slag flakes strewn round its foot
    for k in range(34):
        a = rng.random() * math.pi
        rr = 0.75 + 0.9 * rng.random()
        x = F["x"] + math.cos(a) * rr * 1.2
        z = F["z"] + 0.45 + math.sin(a) * rr * 0.55
        slag = k % 3 == 0
        angular(rock, x, G.y(x, z), z, 0.035 + 0.05 * rng.random(), 0.03, rng, "slagViolet" if slag and k % 2 else ("slag" if slag else "charcoal"), "charcoal", sink=0.01, npts=6)
    # the meteorite anvil: a pitted slab of dark iron-nickel on a rugged limestone pedestal, chisels
    # and a mallet laid by, split geodes glittering at its foot
    An = L["anvil"]
    ay = G.y(An["x"], An["z"])
    oc = An["outcrop"]
    angular(rock, An["x"], ay, An["z"], 0.5, oc + 0.1, rng, "limeCool", "limestoneDark", sink=0.1, npts=16)
    angular(rock, An["x"] + 0.32, ay, An["z"] - 0.22, 0.26, oc * 0.55, rng, "limestone", "limestoneDark", sink=0.1, npts=10)
    for f in chunk(rock, 0.36, 0.2, rng, sink=0.0, squash=0.72, at=(An["x"], ay + oc - 0.05, An["z"]), npts=14):
        f.normal_update()
        rock.setf(f, "steel" if f.normal.z > 0.8 else "meteorite")
    for k in range(6):
        a = rng.random() * 6.28
        blob(glow, An["x"] + math.cos(a) * 0.24, ay + oc + 0.02 + 0.08 * rng.random(), An["z"] + math.sin(a) * 0.18, 0.018, 0.012, 0.018, "violetSoft", cuts=0)
    for k, (dx, dz, ang) in enumerate(((-0.2, 0.08, 0.3), (0.05, 0.14, -0.4), (0.18, -0.1, 1.1))):
        x, z = An["x"] + dx, An["z"] + dz
        cyl(rock, (x - math.cos(ang) * 0.14, ay + oc + 0.17, z - math.sin(ang) * 0.14), (x + math.cos(ang) * 0.14, ay + oc + 0.17, z + math.sin(ang) * 0.14), 0.014, "steel" if k % 2 else "iron", sides=5)
    cyl(rock, (An["x"] - 0.45, ay + 0.02, An["z"] + 0.35), (An["x"] - 0.2, ay + 0.3, An["z"] + 0.42), 0.022, "timber", sides=5)
    box(rock, An["x"] - 0.28, An["x"] - 0.12, ay + 0.26, ay + 0.36, An["z"] + 0.36, An["z"] + 0.48, "iron")
    for k in range(2):
        gx, gz = An["x"] + 0.42 - 0.2 * k, An["z"] + 0.32 + 0.12 * k
        gy = G.y(gx, gz)
        lathe(rock, gx, gz, [(0, 0), (0.1, 0.0), (0.12, 0.06), (0.1, 0.1), (0, 0.1)], "limestoneDark", segs=8, y0=gy - 0.02)
        blob(glow, gx, gy + 0.08, gz, 0.07, 0.03, 0.07, "violet" if k else "cyan", cuts=1)
    # the workshop's floor: flagstones laid from the anvil to the forge's hearth, one masonry
    # workstation (level with the floor: walked on, never tripped over)
    frng = random.Random(77)
    fx0_, fx1_ = An["x"] - 1.0, F["x"] + 1.9
    fz0_, fz1_ = F["z"] + 0.35, An["z"] + 1.0
    zz = fz0_
    row = 0
    while zz < fz1_:
        dz_ = 0.42 + 0.18 * frng.random()
        xx = fx0_ + (0.2 if row % 2 else 0.0)
        while xx < fx1_:
            dx_ = 0.45 + 0.3 * frng.random()
            g_ = 0.035
            corners = [(xx + g_, zz + g_), (xx + dx_ - g_, zz + g_ + 0.02 * frng.random()), (xx + dx_ - g_, zz + dz_ - g_), (xx + g_ + 0.02 * frng.random(), zz + dz_ - g_)]
            # (never under the adit's rails, never on the slope)
            if all(G.walk(cx, cz) for cx, cz in corners) and xx > 1.6:
                q = [rock.v(cx, G.y(cx, cz) + 0.018, cz) for cx, cz in corners]
                f = rock.face(q, "flagstone" if frng.random() < 0.6 else "flagstoneDark")
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
            xx += dx_
        zz += dz_
        row += 1
    rx_, rz_ = An["x"] - 0.85, An["z"] - 0.95
    ry_ = G.y(rx_, rz_)
    for sx in (-0.3, 0.3):
        cyl(rock, (rx_ + sx, ry_ - 0.05, rz_), (rx_ + sx, ry_ + 0.95, rz_), 0.03, "timberDark", sides=5)
    cyl(rock, (rx_ - 0.36, ry_ + 0.88, rz_), (rx_ + 0.36, ry_ + 0.88, rz_), 0.025, "timber", sides=5)
    for k in range(5):
        x = rx_ - 0.24 + k * 0.12
        cyl(rock, (x, ry_ + 0.86, rz_ + 0.02), (x, ry_ + 0.5 + 0.08 * (k % 2), rz_ + 0.04), 0.012, "steel" if k % 2 else "iron", sides=4)
    Cr = L["crate"]
    cy_ = G.y(Cr["x"], Cr["z"])
    box(rock, Cr["x"] - Cr["w"] / 2, Cr["x"] + Cr["w"] / 2, cy_ - 0.05, cy_ + Cr["h"], Cr["z"] - Cr["d"] / 2, Cr["z"] + Cr["d"] / 2, "timber", top="timberDark")
    for sx in (-0.3, 0.3):
        box(rock, Cr["x"] + sx - 0.03, Cr["x"] + sx + 0.03, cy_ - 0.05, cy_ + Cr["h"] + 0.005, Cr["z"] - Cr["d"] / 2 - 0.005, Cr["z"] + Cr["d"] / 2 + 0.005, "iron")
    for k in range(4):
        cyl(rock, (Cr["x"] - 0.25 + k * 0.14, cy_ + Cr["h"] - 0.1, Cr["z"] - 0.05), (Cr["x"] - 0.2 + k * 0.14, cy_ + Cr["h"] + 0.22, Cr["z"] - 0.1 + 0.05 * k), 0.022, "steel" if k % 2 else "timberDark", sides=5)


def basalt_col(M, x, y, z, r, h, rng):
    """A column of basalt: a crisp hexagonal prism (turned at random), its sides flat and sharp, its
    top a fracture: tilted, and now and then broken into a step."""
    rot = rng.random() * math.pi / 3
    ring0 = [(x + r * math.cos(rot + math.pi * k / 3), z + r * math.sin(rot + math.pi * k / 3)) for k in range(6)]
    tilt = 0.12 + 0.28 * rng.random()
    ta = rng.random() * 6.283
    tops = [h + tilt * r * math.cos(math.pi * k / 3 + ta) for k in range(6)]
    lo = [M.v(px, y, pz) for px, pz in ring0]
    hi = [M.v(px, y + t, pz) for (px, pz), t in zip(ring0, tops)]
    shade = rng.random()
    side = "basaltCol" if shade < 0.6 else "basaltColLight"
    for k in range(6):
        k1 = (k + 1) % 6
        f = M.face((lo[k1], lo[k], hi[k], hi[k1]), side)
        f.normal_update()
        cx_ = (lo[k].co + lo[k1].co) / 2
        if f.normal.dot(cx_ - Vector(W(x, y, z))) < 0:
            f.normal_flip()
    f = M.face(list(hi), "basaltTop")
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    # (a stepped break: a short drum sitting off-centre on the top, its own fracture)
    if rng.random() < 0.35 and h > 1.0:
        r2 = r * 0.62
        ox, oz = r * 0.25 * math.cos(ta), r * 0.25 * math.sin(ta)
        top_ = min(tops)
        basalt_drum = [(x + ox + r2 * math.cos(rot + math.pi * k / 3), z + oz + r2 * math.sin(rot + math.pi * k / 3)) for k in range(6)]
        lo2 = [M.v(px, y + top_ - 0.05, pz) for px, pz in basalt_drum]
        hi2 = [M.v(px, y + top_ + 0.22 + 0.2 * rng.random() + 0.06 * math.sin(k), pz) for k, (px, pz) in enumerate(basalt_drum)]
        for k in range(6):
            k1 = (k + 1) % 6
            f = M.face((lo2[k1], lo2[k], hi2[k], hi2[k1]), side)
            f.normal_update()
            cx_ = (lo2[k].co + lo2[k1].co) / 2
            if f.normal.dot(cx_ - Vector(W(x + ox, y, z + oz))) < 0:
                f.normal_flip()
        f = M.face(list(hi2), "basaltTop")
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()


def turned(yaw, roll=0.0, pitch=0.0):
    """Local (along, up, side) offsets to the game's: rolled about the along axis, pitched about the
    side axis, then turned to `yaw` (the along axis heading (sin yaw, cos yaw))."""
    def f(lx, ly, lz):
        cr, sr = math.cos(roll), math.sin(roll)
        y1, z1 = ly * cr - lz * sr, ly * sr + lz * cr
        cp, sp = math.cos(pitch), math.sin(pitch)
        x2, y2 = lx * cp - y1 * sp, lx * sp + y1 * cp
        return x2 * math.sin(yaw) + z1 * math.cos(yaw), y2, x2 * math.cos(yaw) - z1 * math.sin(yaw)
    return f


def hullbox(M, c, rot, hx, hy, hz, top, side):
    """A box turned any way (its eight corners hulled: faces always outward)."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                ox, oy, oz = rot(sx * hx, sy * hy, sz * hz)
                pts.append(bm.verts.new(W(c[0] + ox, c[1] + oy, c[2] + oz)))
    bmesh.ops.convex_hull(bm, input=pts)
    for f in [f for f in bm.faces if any(not v.tag for v in f.verts)]:
        f.normal_update()
        M.setf(f, top if f.normal.z > 0.5 else side)
    for v in bm.verts:
        v.tag = False


def dinghy(M, G, x, z, yaw):
    """A waterlogged rowing boat half-buried in the sand, listing: its strakes grey with age and
    green at the waterline, ribs showing inside, sand drifted into its bilge, a thwart across it and
    an oar beside it."""
    rot = turned(yaw, roll=0.3, pitch=-0.1)
    base = G.y(x, z) - 0.1
    L_, beam, depth = 2.6, 1.1, 0.46
    phis = [math.radians(a) for a in (-90, -64, -38, -12, 12, 38, 64, 90)]
    gun = depth * 0.6

    def local(t, ph, k):
        w = beam / 2 * (1 - t * t) ** 0.55 + 0.02
        d = depth * (0.75 + 0.25 * (1 - t * t))
        return (t * L_ / 2, gun - d * math.cos(ph) * k, w * math.sin(ph) * k)

    def at(lx, ly, lz):
        ox, oy, oz = rot(lx, ly, lz)
        return (x + ox, base + oy, z + oz)

    ts = [-1 + 2 * i / 10 for i in range(11)]
    outer, inner = [], []
    for t in ts:
        ro, ri = [], []
        for pi_, ph in enumerate(phis):
            lo = local(t, ph, 1.0)
            li = local(t, ph, 0.9)
            li = (li[0], li[1] + 0.03, li[2])
            vo = M.v(*at(*lo))
            vi = M.v(*at(*li))
            strake = "boatPlank" if pi_ % 2 else "boatWood"
            M.setv(vo, "algae" if lo[1] < 0.05 else strake)
            M.setv(vi, "boatWoodDark" if li[1] < 0.12 else strake)
            ro.append(vo)
            ri.append(vi)
        outer.append(ro)
        inner.append(ri)
    for i in range(len(ts) - 1):
        tm = (ts[i] + ts[i + 1]) / 2
        # (each face turned by a point up the hull's middle at that station: the outer skin away
        # from it, the inner toward it)
        ref = Vector(W(*at(tm * L_ / 2, gun + 0.35, 0.0)))
        for k in range(len(phis) - 1):
            for arr, outward in ((outer, True), (inner, False)):
                f = M.face((arr[i][k], arr[i][k + 1], arr[i + 1][k + 1], arr[i + 1][k]), "boatWood")
                f.normal_update()
                if (f.normal.dot(f.calc_center_median() - ref) > 0) != outward:
                    f.normal_flip()
                M.setsmooth(f)
        for k in (0, len(phis) - 1):
            f = M.face((outer[i][k], outer[i + 1][k], inner[i + 1][k], inner[i][k]), "boatWoodDark")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
    # the ribs inside the hull
    for t in (-0.6, -0.3, 0.0, 0.3, 0.6):
        pts = [at(*local(t, ph, 0.86)) for ph in phis]
        for a, b in zip(pts, pts[1:]):
            cyl(M, (a[0], a[1] + 0.03, a[2]), (b[0], b[1] + 0.03, b[2]), 0.022, "boatWoodDark", sides=4)
    # the thwart across its middle, the sand drifted into its bilge, an oar in the sand beside it
    hullbox(M, at(0.15, gun - 0.05, 0.0), rot, 0.09, 0.025, beam * 0.43, "boatPlank", "boatWoodDark")
    blob(M, *at(-0.2, 0.02, 0.05), 0.95, 0.12, 0.32, "sandGold", cuts=2, noise=0.15, seed=5)
    ox, oz = x + math.cos(yaw) * 1.0, z - math.sin(yaw) * 1.0
    oy = G.y(ox, oz) + 0.03
    cyl(M, (ox - math.sin(yaw) * 0.85, oy, oz - math.cos(yaw) * 0.85), (ox + math.sin(yaw) * 0.6, oy + 0.02, oz + math.cos(yaw) * 0.6), 0.028, "boatPlank", sides=5)
    hullbox(M, (ox + math.sin(yaw) * 0.78, oy + 0.01, oz + math.cos(yaw) * 0.78), turned(yaw), 0.22, 0.014, 0.08, "boatPlank", "boatWoodDark")
    # the sand heaped over its buried, landward side
    blob(M, x - 0.5, G.y(x - 0.5, z + 0.1) + 0.0, z + 0.1, 0.6, 0.16, 0.55, "sandGold", cuts=1, noise=0.15, seed=7)


def minecart(rock, glow, G, x, z, yaw, rng):
    """A mine cart tipped on its side, rusted through, its ore spilled on the sand, a length of its
    broken rail half-buried behind it."""
    rot = turned(yaw, roll=1.25, pitch=0.12)
    y = G.y(x, z) + 0.32
    # the tub: its floor and four sides, open where it spilled
    hullbox(rock, (x + rot(0, -0.3, 0)[0], y + rot(0, -0.3, 0)[1], z + rot(0, -0.3, 0)[2]), rot, 0.5, 0.03, 0.34, "cartRust", "cartRustDark")
    for sx in (-1, 1):
        c = rot(sx * 0.48, 0.0, 0.0)
        hullbox(rock, (x + c[0], y + c[1], z + c[2]), rot, 0.03, 0.3, 0.34, "cartRust", "cartRustDark")
        c = rot(0.0, 0.0, sx * 0.33)
        hullbox(rock, (x + c[0], y + c[1], z + c[2]), rot, 0.5, 0.3, 0.03, "cartRust", "cartRustDark")
        c = rot(0.0, 0.31, sx * 0.34)
        hullbox(rock, (x + c[0], y + c[1], z + c[2]), rot, 0.53, 0.025, 0.045, "iron", "iron")
        c = rot(sx * 0.5, 0.31, 0.0)
        hullbox(rock, (x + c[0], y + c[1], z + c[2]), rot, 0.045, 0.025, 0.37, "iron", "iron")
    # its wheels, up in the air on the tipped side
    for ax_ in (-0.3, 0.3):
        for sd in (-1, 1):
            c = rot(ax_, -0.38, sd * 0.36)
            d = rot(0.0, 0.0, sd * 0.06)
            cyl(rock, (x + c[0], y + c[1], z + c[2]), (x + c[0] + d[0], y + c[1] + d[1], z + c[2] + d[2]), 0.13, "iron", sides=8)
    # the ore it spilled: lumps of coal, copper and iron on the sand, a few still glinting
    for k in range(12):
        a = yaw + math.pi / 2 + (rng.random() - 0.5) * 1.6
        d = 0.5 + 0.9 * rng.random()
        px, pz = x + math.sin(a) * d, z + math.cos(a) * d
        colr = ("coalChunk", "copperNug", "ironRock", "copperRock")[k % 4]
        angular(rock, px, G.y(px, pz), pz, 0.06 + 0.06 * rng.random(), 0.08, rng, colr, "strataDark", sink=0.02, npts=7)
        if k % 4 == 1:
            blob(glow, px, G.y(px, pz) + 0.07, pz, 0.025, 0.02, 0.025, "copperGlow", cuts=0)
    # the broken rail behind it, sleepers half-sunk
    for k in range(4):
        t = -1.0 - 0.55 * k
        c = (x + math.sin(yaw) * t, z + math.cos(yaw) * t)
        hullbox(rock, (c[0], G.y(c[0], c[1]) + 0.01, c[1]), turned(yaw + 0.05 * k), 0.08, 0.03, 0.5, "timberDark", "timberDark")
    # the rails, buckled: bent up off their sleepers where the roof came down on them
    for sd in (-0.35, 0.35):
        pts = []
        for t, lift in ((-0.9, 0.06), (-1.5, 0.05), (-2.0, 0.28 if sd < 0 else 0.18), (-2.4, 0.4 if sd < 0 else 0.1), (-2.9, 0.03)):
            px_ = x + math.sin(yaw) * t + math.cos(yaw) * sd * (1 + 0.1 * (t + 0.9))
            pz_ = z + math.cos(yaw) * t - math.sin(yaw) * sd * (1 + 0.1 * (t + 0.9))
            pts.append((px_, G.y(px_, pz_) + lift, pz_))
        for a, b in zip(pts, pts[1:]):
            cyl(rock, a, b, 0.022, "rustDark", sides=4)


def crystal_cluster(glow, rock, x, y, z, s, rng, lean_to=None):
    angular(rock, x, y, z, 0.3 * s, 0.22 * s, rng, "glimmerBase", "tunnel", sink=0.1, npts=9)
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.random() * 0.6
        lean = 0.25 + 0.4 * rng.random()
        d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
        if lean_to:
            d = (d[0] + lean_to[0] * 0.6, d[1], d[2] + lean_to[1] * 0.6)
        prism(glow, (x + math.cos(a) * 0.12 * s, y + 0.05, z + math.sin(a) * 0.12 * s), d, (0.05 + 0.04 * rng.random()) * s, (0.35 + 0.6 * rng.random()) * s, "cyan" if (k + int(x)) % 3 else "violet", sides=5)


# ---------------------------------------------------------------------------------------------
# the world


def build_world(G, L, coll, ledge_top):
    half = L["half"]
    ground = Mesh("CV_Clay")
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    water = Mesh("CV_Water")
    therm = Mesh("CV_ThermalWater")
    rng = random.Random(11)
    lt = L["lights"]
    Cp = L["camp"]

    # --- the light painted in ---
    add_light(1.0, 13.0, -16.5, "#FFD27A", 1.0, 17.0)  # the sun down the doline (the game's own sun does the rest)
    add_light(-6.0, 9.0, -20.0, "#FFE2A8", 0.5, 9.0)
    add_light(7.0, 9.0, -20.0, "#FFE2A8", 0.5, 9.0)
    add_light(*lt["forge"], "#FF8A3A", 1.5, 6.5)
    add_light(L["forge"]["x"], G.y(L["forge"]["x"], L["forge"]["z"] + 1.2) + 1.1, L["forge"]["z"] + 0.1, "#FF5A1F", 1.2, 3.2)  # the crucible
    add_light(L["forge"]["x"], G.y(L["forge"]["x"], L["forge"]["z"] + 1.2) + 0.5, L["forge"]["z"] + 1.0, "#FF7A2F", 1.0, 2.6)  # the fire-mouth
    add_light(*lt["thermal"], "#FFE9C4", 1.6, 8.0)
    add_light(*lt["cenote"], "#35E6FF", 1.9, 10.5)
    add_light(L["skylight"]["x"], 9.0, L["skylight"]["z"], "#D6ECFF", 1.4, 11.0)
    add_light(L["finnegan"]["x"] + 0.7, G.y(L["finnegan"]["x"], L["finnegan"]["z"]) + 0.5, L["finnegan"]["z"] + 0.3, "#FFB347", 1.2, 4.5)
    add_light((Cp["posts"][0][0] + Cp["posts"][1][0]) / 2, G.y(-6.2, -15.6) + 2.2, Cp["posts"][0][1], "#FFB347", 1.6, 5.0)
    add_light(L["adit"]["x"] + 0.7, G.y(L["adit"]["x"], -half + 1.5) + 2.0, L["adit"]["z"] + 0.9, "#FFB347", 1.3, 4.5)
    for x, z, s in L["crystals"]:
        add_light(x, G.y(x, z) + 0.6 * s, z, "#00F0FF" if (int(x * 7 + z * 3) % 3) else "#9D00FF", 0.25 * s, 0.9 * s + 0.3)
    for x, z, s in L["shrooms"]:
        add_light(x, G.y(x, z) + 0.45 * s, z, "#4FFFD2" if (int(x * 5 + z) % 2) else "#FF7AD9", 0.3 * s, 1.0 * s + 0.3)
    for n in L["nodes"]:
        if n["kind"] in ("silver", "glimmer"):
            add_light(n["x"], G.y(n["x"], n["z"]) + 0.8, n["z"], "#6FF6FF" if n["kind"] == "glimmer" else "#DFF6FF", 0.3, 1.4)

    # --- the floor (the walk collider itself), the lake's water, the walls and their vault ---
    runoff = runoff_paths(G, L)
    build_ground(G, L, ground, water, runoff)
    build_shell(G, L, shell, glow, rock, roots, rng)
    build_outpost(G, L, rock, glow, water, rng)

    # --- the open rim: the ground's section down its south and east edges, strata in it ---
    n = G.n
    for edge in ("south", "east"):
        prev = None
        for t in range(n):
            x, z = G.at(t, n - 1) if edge == "south" else G.at(n - 1, t)
            y = G.h[(n - 1) * n + t] if edge == "south" else G.h[t * n + n - 1]
            top = rock.v(x, y, z)
            bot = rock.v(x, -2.8, z)
            rock.setv(top, "strata")
            rock.setv(bot, "sectionDark")
            if prev:
                q = (prev[0], top, bot, prev[1]) if edge == "south" else (prev[1], bot, top, prev[0])
                f = rock.face(q, "strata")
                # (faced out of the map, toward the camera: never culled, never a black void past the rim)
                f.normal_update()
                if (edge == "south" and f.normal.y > 0) or (edge == "east" and f.normal.x < 0):
                    f.normal_flip()
                rock.setsmooth(f)
            prev = (top, bot)

    # --- the living rock, sculpted as one body: the doline's terraced karst mounds draped in moss,
    # the talus's mammoth outcrops, the islet's crag, the boulders fallen from the vault ---
    src = Mesh("CV_Clay")
    mrng = random.Random(5)
    for x, z, r, h in L["mounds"]:
        y = G.y(x, z)
        for k in range(3):
            rr = r * (1 - 0.27 * k)
            blob(src, x + 0.12 * k * math.sin(x), y - 0.15 + h * (0.22 + 0.34 * k), z + 0.1 * k * math.cos(z), rr * 1.05, h * 0.3, rr * 0.95, "limestone", cuts=2, noise=0.22, seed=int(x * 7 + z * 3) + k)
    for x, z, r, h in L["outcrops"]:
        y = G.y(x, z)
        for f in chunk(src, r, h, mrng, sink=0.5, squash=0.8, at=(x, y, z), npts=16):
            pass
        ox, oz = x + r * 0.65, z - r * 0.3
        for f in chunk(src, r * 0.6, h * 0.6, mrng, sink=0.3, squash=0.9, at=(ox, G.y(ox, oz), oz), npts=12):
            pass
    for x, z, r in L["boulders"]:
        for f in chunk(src, r, r * 1.25, mrng, sink=0.3, squash=0.85, at=(x, G.y(x, z), z), npts=14):
            pass
    for rg in L["ridges"]:
        if rg["id"] == "eastSpine":
            continue
        for x, z, r, h in rg["points"]:
            y = G.y(x, z)
            for f in chunk(src, r * 1.05, h, mrng, sink=0.6, squash=0.9, at=(x, y, z), npts=16):
                pass
            ox, oz = x + (mrng.random() - 0.5) * r, z + (mrng.random() - 0.5) * r
            for f in chunk(src, r * 0.7, h * 0.65, mrng, sink=0.4, squash=0.9, at=(ox, G.y(ox, oz), oz), npts=12):
                pass
    T_ = L["terraces"]
    for pool in T_["pools"]:
        # (the rimstone flowing off the cliff into each pool's back: the grotto's stone all one)
        for k in range(3):
            zz = pool["z0"] + (pool["z1"] - pool["z0"]) * (k + 0.5) / 3
            blob(src, T_["x0"] - 0.55, G.y(T_["x0"] - 0.6, zz) + 0.2, zz, 0.75, 0.5, 0.7, "flowstone", cuts=1, noise=0.2, seed=int(zz * 10) + k)
    ox, oz, orr, oh = L["survey"]["outcrop"]
    for f in chunk(src, orr, oh, mrng, sink=0.3, squash=0.85, at=(ox, G.y(ox, oz), oz), npts=14):
        pass
    # the wreck's rock base on the beach, and the fallen rock closing the survey alcove
    for x, z, r, h in L["survey"]["rocks"]:
        for f in chunk(src, r, h, mrng, sink=0.35, squash=0.85, at=(x, G.y(x, z), z), npts=14):
            pass
    Tw = L["tower"]
    tx, tz = Tw["x"], Tw["z"]
    ty = G.y(tx, tz)
    crag = Mesh("CV_Clay")
    for k, (dx, dz, r, h, y0) in enumerate(((-0.55, 0.35, 1.45, 1.5, -0.5), (-0.25, 0.1, 1.15, 1.5, 0.8), (0.25, -0.2, 1.35, 0.9, 2.0), (-0.35, 0.25, 0.85, 1.1, 2.7), (-0.5, 0.45, 0.5, 1.0, 3.6), (-1.3, 0.9, 0.8, 1.2, -0.4))):
        for f in chunk(crag, r, h, mrng, sink=0.0, squash=0.82, at=(tx + dx, ty + y0, tz + dz), npts=16):
            pass
    for x, z, r, h in L["stalagmites"]:
        # (the towering ones' feet: a heap of flowstone round them)
        blob(src, x, G.y(x, z) + 0.1, z, r * 1.5, 0.35, r * 1.4, "flowstone", cuts=1, noise=0.2, seed=int(x * 3 + z))

    def floor_weight(x, y, z):
        # (the weathering never lifts a base off the floor, nor pushes rock onto the walks)
        return smooth(0.05, 0.45, y - G.y(x, z))

    def mass_col(x, y, z, nx, ny, nz):
        g = G.y(x, z)
        n1 = fbm(x * 0.8, y * 0.8, z * 0.8, 61)
        band = 0.5 + 0.5 * math.sin(y * 5.5 + n1 * 2.2)
        c = mixc("limestone", "limeCool", band * 0.6)
        c = mixc(c, "strata", max(0.0, fbm(x * 1.7, y * 1.7, z * 1.7, 63)) * 0.5)
        c = mixc(c, "limestoneDark", smooth(0.4, 0.0, y - g) * 0.6)
        if x < -13.0 and z < -8.0:
            c = mixc(c, "slate", 0.45)
        if 11.6 < x < 14.8 and z < 0.5:
            # (the east slate spine: dark slate in beds, pale ledges)
            c = mixc("slateCliff", "slateCliffLight", 0.5 + 0.5 * math.sin(y * 7.0 + n1 * 2.0))
            c = mixc(c, "chasmMoss", smooth(0.5, 0.9, ny) * 0.5)
            return c
        if x < -16.0 and -9.5 < z < 8.5:
            # (the grotto's buttress: flowstone draping its feet where the warm water runs)
            c = mixc(c, "flowstoneWarm", smooth(1.2, 0.2, y - g) * 0.6)
        up = smooth(0.45, 0.85, ny)
        mossy = (z < -9.0 and x > -13.5) or math.hypot(x - tx, z - tz) < 3.5
        if mossy:
            c = mixc(c, mixc("mossDeep", "mossMid", 0.5 + 0.5 * n1), up * 0.9)
            c = mixc(c, "mossLime", up * smooth(0.2, 0.5, fbm(x * 3, y * 3, z * 3, 67)) * 0.6)
        else:
            c = mixc(c, "mossMid", up * max(0.0, n1) * 0.5)
        return c

    emit(rock, sculpt(src, "Rock", voxel=0.25, pits=0.28, strata=0.16, target=6600, weight=floor_weight), mass_col)
    # (the crag carved crisper: flat facets, its limestone fractured)
    emit(rock, sculpt(crag, "Crag", voxel=0.2, pits=0.25, strata=0.22, target=750, weight=floor_weight), mass_col, smooth_=False)

    # --- the Abyssal Chasm's walls: crisp hexagonal columns of basalt, tall volcanic pillars with
    # stepped, fractured tops, down its east side, standing in its fins, and cresting the East Spine
    # between the chasm and the central slope (in the occluding finish: they thin to a dither when
    # they stand between you and the camera) ---
    crng = random.Random(23)
    # the east wall: three ranks of pillars, the front rank lower, their heights stepping
    for rank, (cx0, hmul) in enumerate(((22.55, 0.74), (23.3, 1.0))):
        z = -21.9 + 0.25 * rank
        k = 0
        while z < 2.2:
            r = 0.3 + 0.12 * crng.random()
            x = cx0 + (0.18 if k % 2 else -0.05) + 0.06 * crng.random()
            gy = G.y(min(x, half - 0.1), z)
            step = (0.55 * math.sin(z * 0.9 + rank) + 0.35 * math.sin(z * 2.3)) * 1.1
            ht = max(1.2, (4.4 + step + 1.4 * crng.random()) * hmul) * (1.0 - 0.35 * smooth(-1.0, 2.2, z))
            basalt_col(roots, x, gy - 0.4, z, r, ht + 0.4, crng)
            z += r * 1.72
            k += 1
    # the fins standing in the chasm: clusters of columns along each
    for x, z, rx, rz, h, yaw in L["fins"]:
        ln, w = max(rx, rz), min(rx, rz)
        along = (math.cos(yaw), -math.sin(yaw)) if rx >= rz else (math.sin(yaw), math.cos(yaw))
        side = (-along[1], along[0])
        t = -ln
        while t <= ln:
            for o in (-0.5, 0.5) if w > 0.45 else (0.0,):
                r = 0.24 + 0.1 * crng.random()
                px, pz = x + along[0] * t + side[0] * o * w, z + along[1] * t + side[1] * o * w
                crest = math.cos(0.5 * math.pi * t / max(ln, 0.1))
                basalt_col(roots, px, G.y(px, pz) - 0.3, pz, r, max(0.6, h * (0.55 + 0.45 * crest) * (0.8 + 0.3 * crng.random())) + 0.3, crng)
            t += 0.5
    # the East Spine: a crest of columns down its line, tallest along its spine, lower on its flanks
    spine = next(rg for rg in L["ridges"] if rg["id"] == "eastSpine")["points"]
    for (ax_, az_, ar, ah), (bx_, bz_, br, bh) in zip(spine, spine[1:]):
        seg = math.hypot(bx_ - ax_, bz_ - az_)
        n_ = max(2, int(seg / 0.55))
        for j in range(n_):
            u = j / n_
            cx_, cz_ = ax_ + (bx_ - ax_) * u, az_ + (bz_ - az_) * u
            rr, hh = ar + (br - ar) * u, ah + (bh - ah) * u
            for o, hk in ((-0.62, 0.62), (0.0, 1.0), (0.62, 0.7)):
                px = cx_ + o * rr + 0.08 * (crng.random() - 0.5)
                pz = cz_ + 0.12 * (crng.random() - 0.5)
                basalt_col(roots, px, G.y(px, pz) - 0.35, pz, 0.26 + 0.08 * crng.random(), max(0.5, hh * hk * (0.85 + 0.3 * crng.random())) + 0.35, crng)
    # bioluminescent fungi at the pillars' feet: the only life in the chasm's dark
    for k in range(16):
        z = -20.5 + 21.0 * crng.random()
        x = 21.2 + 0.5 * crng.random() if k % 3 else 14.0 + 0.4 * crng.random()
        y = G.y(min(x, half - 0.1), z)
        for j in range(3):
            px, pz = x + (crng.random() - 0.5) * 0.35, z + (crng.random() - 0.5) * 0.35
            hh = 0.06 + 0.08 * crng.random()
            cyl(rock, (px, y - 0.02, pz), (px, y + hh, pz), 0.012, "shroomStem", sides=4, cap=False)
            blob(glow, px, y + hh, pz, 0.045, 0.02, 0.045, "shroomTeal" if (k + j) % 3 else "shroomPink", cuts=0)
    fractures = [tuple(f) for f in L["fractures"]]
    for fx_, fz_, lean in fractures:
        if any(math.hypot(fx_ - nd["x"], fz_ - nd["z"]) < 1.3 for nd in L["nodes"]):
            continue
        gy = G.y(min(fx_, half - 0.1), fz_)
        y0 = gy + 0.35 + 0.5 * crng.random()
        ht = 1.2 + 1.2 * crng.random()
        # the fracture: a jagged crack up the rock face, widest in the middle
        zig = [(fz_ + 0.12 * math.sin(k * 2.3 + fz_) + 0.06 * (crng.random() - 0.5), y0 - 0.25 + (ht + 0.5) * k / 6) for k in range(7)]
        px = fx_ + lean * 0.03
        prev = None
        for k, (zz, yy) in enumerate(zig):
            w_ = 0.02 + 0.07 * math.sin(math.pi * k / 6)
            a_ = rock.v(px, yy, zz - w_)
            b_ = rock.v(px, yy, zz + w_)
            rock.setv(a_, "tunnel")
            rock.setv(b_, "tunnel")
            if prev:
                f = rock.face((prev[0], prev[1], b_, a_), "tunnel")
                f.normal_update()
                if (f.normal.x > 0) != (lean > 0):
                    f.normal_flip()
            prev = (a_, b_)
        # the crystals bursting out of it: two or three clusters, one big
        for j, (at, big) in enumerate(((0.3, 1.0), (0.62, 0.6), (0.85, 0.45))[: 2 + (int(fz_ * 3) % 2)]):
            zz, yy = zig[int(at * 6)][0], y0 - 0.25 + (ht + 0.5) * at
            colr = "cyan" if (j + int(abs(fz_))) % 3 else "violet"
            for m in range(4 + int(3 * big)):
                d = (lean * (0.55 + 0.45 * crng.random()), 0.2 + 0.7 * crng.random(), (crng.random() - 0.5) * 0.9)
                prism(glow, (px, yy + (crng.random() - 0.5) * 0.12, zz + (crng.random() - 0.5) * 0.1), d, (0.035 + 0.04 * crng.random()) * (0.6 + 0.6 * big), (0.22 + 0.35 * crng.random()) * (0.6 + 0.7 * big), colr if m % 3 else (colr + "Soft"), sides=5)
            # a prism beetle on the biggest, its shell glinting
            if j == 0:
                bx_, by_, bz_ = px + lean * 0.12, yy - 0.12, zz + 0.1
                blob(glow, bx_, by_, bz_, 0.05, 0.03, 0.065, "beetle", cuts=1)
                blob(glow, bx_ + lean * 0.012, by_ + 0.02, bz_ + 0.05, 0.028, 0.02, 0.024, "beetleGlow", cuts=0)

    for x, z, s in L["crystals"]:
        crystal_cluster(glow, rock, x, G.y(x, z), z, s, rng)
        if x > 12.0:
            for j in range(2):
                a = rng.random() * 6.28
                bx_, bz_ = x + math.cos(a) * 0.2 * s, z + math.sin(a) * 0.2 * s
                blob(glow, bx_, G.y(x, z) + 0.28 * s, bz_, 0.05, 0.03, 0.065, "beetle", cuts=1)
                blob(glow, bx_, G.y(x, z) + 0.28 * s + 0.025, bz_ + 0.04, 0.028, 0.02, 0.024, "beetleGlow", cuts=0)
    for x, z, s in L["shrooms"]:
        y = G.y(x, z)
        for k in range(4):
            a = 2 * math.pi * k / 4 + rng.random()
            px, pz = x + math.cos(a) * 0.22 * s, z + math.sin(a) * 0.22 * s
            hh = (0.25 + 0.3 * rng.random()) * s
            cyl(rock, (px, y - 0.05, pz), (px, y + hh, pz), 0.04 * s, "shroomStem", sides=5)
            blob(glow, px, y + hh, pz, 0.14 * s, 0.06 * s, 0.14 * s, "shroomTeal" if (k + int(x)) % 2 else "shroomPink", cuts=1)

    # --- the great talus: fractured limestone blocks heaped in piles where the slope let them fall,
    # crowding the outside of each switchback's bend (a winding path between them, never a line of
    # stones across the slope) ---
    trng = random.Random(41)
    nodes = [(nd["x"], nd["z"]) for nd in L["nodes"]]
    centres = []
    for p in L["paths"]:
        pts = p["points"]
        for i in range(len(pts)):
            ax_, az_ = pts[max(0, i - 1)][0], pts[max(0, i - 1)][1]
            bx_, bz_ = pts[i][0], pts[i][1]
            cx_, cz_ = pts[min(len(pts) - 1, i + 1)][0], pts[min(len(pts) - 1, i + 1)][1]
            # (the outside of the bend: away from where the trail turns)
            ox, oz = (bx_ - (ax_ + cx_) / 2), (bz_ - (az_ + cz_) / 2)
            ol = math.hypot(ox, oz)
            if ol < 0.2:
                ox, oz = -(cz_ - az_), (cx_ - ax_)
                ol = math.hypot(ox, oz) or 1.0
            for side in (1, -1) if i in (0, len(pts) - 1) else (1,):
                d = p["half"] + 1.5 + 0.6 * trng.random()
                centres.append((bx_ + side * ox / ol * d, bz_ + side * oz / ol * d, 0.9 + 0.4 * trng.random()))
    piles = 0
    for k in range(800):
        if piles >= 13:
            break
        x = -20.0 + 40.0 * trng.random()
        z = -20.0 + 28.0 * trng.random()
        if G.walk(x, z) or not (0.4 < G.y(x, z) < 3.4) or any(math.hypot(x - a, z - b) < 4.5 for a, b, _ in centres):
            continue
        e = 0.3
        steep = math.hypot(G.y(x + e, z) - G.y(x - e, z), G.y(x, z + e) - G.y(x, z - e)) / (2 * e)
        if steep < 0.3:
            continue
        centres.append((x, z, 1.1 + 0.5 * trng.random()))
        piles += 1
    placed = 0
    T = L["terraces"]
    for cx_, cz_, size in centres:
        for j in range(14):
            if j == 0:
                x, z, r = cx_, cz_, 0.45 + 0.3 * trng.random() * size
            else:
                a = trng.random() * 6.283
                d = (0.4 + 1.1 * trng.random()) * size
                x, z, r = cx_ + math.cos(a) * d, cz_ + math.sin(a) * d, 0.12 + 0.3 * trng.random() ** 1.4 * size
            if G.walk(x, z) or any(math.hypot(x - a_, z - b_) < 1.3 for a_, b_ in nodes):
                continue
            if T["x0"] - 1.0 < x < T["x1"] + 0.5 and T["pools"][0]["z0"] - 0.8 < z < T["pools"][-1]["z1"] + 0.8:
                continue
            y = G.y(x, z)
            if y < 0.1:
                continue
            angular(rock, x, y, z, r, r * (0.8 + 0.5 * trng.random()), trng, "limeCool" if trng.random() < 0.6 else "limestone", "limestoneDark", sink=0.15, npts=10)
            placed += 1
    GEO_STATS["talus"] = placed
    # --- the explorer's trails' edges: small stones set along both sides of the packed dirt, so the
    # path reads from above (decoration only: nothing to walk round) ---
    erng = random.Random(53)
    for p in L["paths"]:
        pts = p["points"]
        for (ax_, az_, _), (bx_, bz_, _) in zip(pts, pts[1:]):
            seg = math.hypot(bx_ - ax_, bz_ - az_)
            tx_, tz_ = (bx_ - ax_) / seg, (bz_ - az_) / seg
            t = 0.4
            while t < seg:
                for side in (-1, 1):
                    d = p["half"] + 0.12 + 0.12 * erng.random()
                    x = ax_ + tx_ * t - tz_ * d * side
                    z = az_ + tz_ * t + tx_ * d * side
                    if lake_factor(L, x, z) < 1.2:
                        continue
                    r_ = 0.09 + 0.07 * erng.random()
                    blob(rock, x, G.y(x, z) + r_ * 0.25, z, r_, r_ * 0.6, r_ * 0.85, "limeCool" if erng.random() < 0.6 else "limestone", cuts=0, noise=0.25, seed=int(t * 10) + side)
                t += 1.0 + 0.6 * erng.random()

    # the doline's breakdown rubble: small angular chips on its floor, fallen from the vault
    for k in range(70):
        x = -12.5 + 25.0 * trng.random()
        z = -21.0 + 10.0 * trng.random()
        if not G.walk(x, z) or any(math.hypot(x - a, z - b) < 1.0 for a, b in nodes):
            continue
        r = 0.07 + 0.12 * trng.random()
        angular(rock, x, G.y(x, z), z, r, r * 0.8, trng, "limeFloor", "limestoneDark", sink=0.05, npts=8)

    # --- the doline's ferns in the lee of its mounds and boulders ---
    for k in range(36):
        x = -12.0 + rng.random() * 24.0
        z = -21.0 + rng.random() * 9.5
        if not G.walk(x, z) or any(math.hypot(x - a, z - b) < 0.9 for a, b in nodes):
            continue
        fern(rock, x, G.y(x, z), z, 0.25 + 0.2 * rng.random(), rng)

    # --- the Travertine Thermal Terraces: rimstone dams flowing round each pool (gour lips, stepped
    # and scalloped, never a ring of pebbles), warm water in them, cascades over their lips, the
    # spring from the cliff, the six stone seats ---
    pools = G.pools
    for pi, P in enumerate(pools):
        (cx, cz, rx, rz), outline = pool_outline(G, pi, pi * 1.7 + 0.3)
        wy_ = P["y"]
        rings_t = []
        for scale, lift, colr in ((0.95, 0.0, "travertine"), (1.0, 0.1, "travertine"), (1.06, 0.12, "flowstoneWarm"), (1.2, None, "travertineShadow")):
            ring = []
            for k, (px, pz) in enumerate(outline):
                qx, qz = cx + (px - cx) * scale, cz + (pz - cz) * scale
                gy = G.y(qx, qz)
                # (the dam's crest scalloped where the water spills over it; its foot on the ground)
                y = (gy - 0.04) if lift is None else max(gy - 0.02, wy_ + lift + 0.035 * math.sin(k * 2.3 + pi) * (lift > 0))
                v = rock.v(qx, y, qz)
                rock.setv(v, colr)
                ring.append(v)
            rings_t.append(ring)
        for r0, r1 in zip(rings_t, rings_t[1:]):
            for k in range(len(outline)):
                k1 = (k + 1) % len(outline)
                f = rock.face((r0[k], r0[k1], r1[k1], r1[k]), "travertine")
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
                rock.setsmooth(f)
        wv = [therm.v(px, wy_, pz) for px, pz in [(cx + (qx - cx) * 0.97, cz + (qz - cz) * 0.97) for qx, qz in outline]]
        mid = therm.v(cx, wy_, cz)
        for k in range(len(wv)):
            f = therm.face((mid, wv[(k + 1) % len(wv)], wv[k]), "thermalWater")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        if pi + 1 < len(pools):
            ny_ = pools[pi + 1]["y"]
            for k in range(3):
                ccx = cx - 1.2 + 1.2 * k
                q = [therm.v(ccx - 0.28, wy_ + 0.03, cz + rz - 0.02), therm.v(ccx + 0.28, wy_ + 0.03, cz + rz - 0.02), therm.v(ccx + 0.32, ny_ - 0.02, cz + rz + 0.38), therm.v(ccx - 0.32, ny_ - 0.02, cz + rz + 0.38)]
                therm.face(q, "thermalWater")
                blob(rock, ccx, ny_ + 0.02, cz + rz + 0.46, 0.28, 0.03, 0.13, "foam", cuts=1)
        else:
            for k in range(3):
                t = (k + 1) / 4
                blob(rock, cx + 1.2 * t, wy_ - 0.2 * k, cz + rz + 0.4 + 1.5 * t, 0.3, 0.03, 0.18, "foam", cuts=1)
        for st in L["thermalSeats"]:
            if P["z0"] <= st["z"] <= P["z1"]:
                blob(rock, st["x"], wy_ + ledge_top - 0.12, st["z"], 0.36, 0.14, 0.32, "travertine", cuts=1, noise=0.15, seed=int(st["z"] * 10), bottom=wy_ - 0.4, top=wy_ + ledge_top)
    sp_z = (L["terraces"]["pools"][0]["z0"] + L["terraces"]["pools"][0]["z1"]) / 2
    for k in range(6):
        blob(rock, -half + 0.9, pools[0]["y"] + 0.25 + k * 0.32, sp_z + 0.2 * math.sin(k), 0.16, 0.24, 0.28, "flowstoneWarm", cuts=1)
    q = [therm.v(-half + 1.05, pools[0]["y"] + 2.1, sp_z - 0.25), therm.v(-half + 1.05, pools[0]["y"] + 2.1, sp_z + 0.25), therm.v(-half + 1.15, pools[0]["y"] + 0.01, sp_z + 0.35), therm.v(-half + 1.15, pools[0]["y"] + 0.01, sp_z - 0.35)]
    therm.face(q, "thermalWater")

    # --- the islet: ferns on its crag, the ancient banyan roots sprawling from its ledges, twisting
    # down into the islet and the deep water (in the occluding finish) ---
    I = L["islet"]
    Mo = L["nodes"][-1]
    for k in range(10):
        a = rng.random() * 6.28
        rr = I["r"] * (0.35 + 0.35 * rng.random())
        px, pz = I["x"] + math.cos(a) * rr, I["z"] + math.sin(a) * rr
        if math.hypot(px - Mo["x"], pz - Mo["z"]) < 1.5:
            continue
        fern(rock, px, G.y(px, pz), pz, 0.3 + 0.2 * rng.random(), rng)
    for k, (dx, dy, dz, sc) in enumerate([(-0.5, 4.55, 0.45, 0.5), (0.2, 2.85, -0.3, 0.45), (-0.9, 3.7, 0.7, 0.4), (-1.3, 0.8, 1.2, 0.45)]):
        fern(rock, tx + dx, ty + dy, tz + dz, sc, rng)
    inward = math.atan2(I["z"] - tz, I["x"] - tx)
    rrng = random.Random(77)
    made = 0
    for k in range(120):
        if made >= 18:
            break
        a0 = rrng.random() * 6.283
        spin = (0.5 + 0.8 * rrng.random()) * (1 if rrng.random() < 0.5 else -1)
        end = a0 + spin
        # (the flare lands on the crag's far side: the water, never the islet's walk)
        if abs(math.atan2(math.sin(end - inward), math.cos(end - inward))) < 1.35:
            continue
        y0 = ty + 2.6 + 1.6 * rrng.random()
        flare = 1.2 + 1.6 * rrng.random()
        pts = []
        for j in range(10):
            t = j / 9
            ang = a0 + spin * t
            y = y0 + (-0.9 - y0) * t
            # (hugging the crag's flank, then flaring out over the water to dive into it)
            hug = 0.95 + 0.35 * smooth(ty + 2.2, ty + 3.2, y) + 0.12 * math.sin(t * 9 + k)
            rr = hug + flare * smooth(0.55, 1.0, t) ** 1.4
            x = tx - 0.45 + math.cos(ang) * rr
            z = tz + 0.35 + math.sin(ang) * rr
            y = max(y, min(G.y(x, z), L["lake"]["water"]) - 0.9) if t < 0.95 else min(y, L["lake"]["water"] - 0.8)
            pts.append((x, y, z))
        base = 0.11 + 0.07 * rrng.random()
        tube(roots, pts, [base * (1 - 0.55 * j / 9) + 0.02 for j in range(10)], "banyan", sides=6, colours=[mixc("banyan", "banyanDark", j / 9) for j in range(10)], cap_start=True)
        if made % 3 == 0:
            # an aerial root hanging from the limb into the water (a banyan's pillar in the making)
            mx, my, mz = pts[6]
            gy = L["lake"]["water"] - 0.5
            if my > gy + 0.5:
                tube(roots, [(mx, my, mz), (mx + 0.05, (my + gy) / 2, mz), (mx, gy, mz)], [0.03, 0.025, 0.02], "banyanDark", sides=4, cap_end=False)
        made += 1
    GEO_STATS["banyanRoots"] = made

    # --- the shore: reeds in the shallows and driftwood washed up all the way round the lake ---
    wy = L["lake"]["water"]
    srng = random.Random(9)
    shore = []
    for k in range(G.n - 1):
        for i in range(G.n - 1):
            h0 = G.h[k * G.n + i]
            h1 = G.h[k * G.n + i + 1]
            h2 = G.h[(k + 1) * G.n + i]
            if (h0 - wy) * (h1 - wy) < 0 or (h0 - wy) * (h2 - wy) < 0:
                x, z = G.at(i, k)
                if math.hypot((x - L["lake"]["x"]) / L["lake"]["rx"], (z - L["lake"]["z"]) / L["lake"]["rz"]) < 1.3:
                    shore.append((x, z))
    srng.shuffle(shore)
    fin = L["finnegan"]
    used = []
    for x, z in shore:
        if len(used) >= 26:
            break
        if any(math.hypot(x - a, z - b) < 1.6 for a, b in used) or math.hypot(x - fin["x"], z - fin["z"]) < 2.2:
            continue
        if any(math.hypot(x - p[0], z - p[1]) < L["sandbar"]["half"] + 0.6 for p in L["sandbar"]["points"]):
            continue
        used.append((x, z))
        y = G.y(x, z)
        if len(used) % 4 == 0:
            ang = srng.random() * 3.14
            ln = 0.7 + 0.7 * srng.random()
            cyl(rock, (x - math.cos(ang) * ln / 2, y + 0.05, z - math.sin(ang) * ln / 2), (x + math.cos(ang) * ln / 2, y + 0.08, z + math.sin(ang) * ln / 2), 0.06, "driftwood", sides=6)
        else:
            for j in range(4):
                rx_, rz_ = x + (srng.random() - 0.5) * 0.6, z + (srng.random() - 0.5) * 0.6
                cyl(rock, (rx_, y - 0.1, rz_), (rx_ + (srng.random() - 0.5) * 0.18, y + 0.45 + 0.45 * srng.random(), rz_ + (srng.random() - 0.5) * 0.18), 0.012, "reedPale" if j % 2 else "reedPaleDark", sides=3, r_end=0.004, cap=False)

    # --- the runoff's trickles: a thin film of water down the slopes, darkening the stone, tapering
    # out where the ground flattens (never a dashed line) ---
    for pts in runoff:
        ys = [G.y(x, z) for x, z in pts]
        slope = []
        for i in range(len(pts)):
            a, b = max(0, i - 6), min(len(pts) - 1, i + 6)
            run = sum(math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) for k in range(a, b)) or 1.0
            slope.append(abs(ys[a] - ys[b]) / run)
        rim = []
        for i, (x, z) in enumerate(pts):
            j = min(i + 1, len(pts) - 1)
            k = max(i - 1, 0)
            tx, tz = pts[j][0] - pts[k][0], pts[j][1] - pts[k][1]
            tl = math.hypot(tx, tz) or 1.0
            w_ = 0.012 + 0.045 * smooth(0.06, 0.3, slope[i])
            if ys[i] < L["lake"]["water"] + 0.02:
                w_ = 0.0
            rim.append((x - tz / tl * w_, z + tx / tl * w_, x + tz / tl * w_, z - tx / tl * w_, w_))
        # (one strip: each cross-section's two verts shared by the quads either side of it)
        prev = None
        for i in range(len(pts) - 1):
            if rim[i][4] < 0.02 and rim[i + 1][4] < 0.02:
                prev = None
                continue
            ax0, az0, ax1, az1, _ = rim[i]
            bx0, bz0, bx1, bz1, _ = rim[i + 1]
            a_ = prev or (water.v(ax0, G.y(ax0, az0) + 0.025, az0), water.v(ax1, G.y(ax1, az1) + 0.025, az1))
            b_ = (water.v(bx0, G.y(bx0, bz0) + 0.025, bz0), water.v(bx1, G.y(bx1, bz1) + 0.025, bz1))
            prev = b_
            q = [a_[0], a_[1], b_[1], b_[0]]
            for v in q:
                water.setv(v, "wetSheen")
            f = water.face(q, "wetSheen")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()

    # --- the beach: a sunken dinghy half-buried in the sand, driftwood logs, tidal rock pools,
    # cave ferns ---
    B = L["beach"]
    brng = random.Random(61)
    dx_, dz_, dyaw = B["dinghy"]
    dinghy(rock, G, dx_, dz_, dyaw)
    for x, z, yaw, ln in B["logs"]:
        y = G.y(x, z)
        ax_, az_ = x - math.cos(yaw) * ln / 2, z + math.sin(yaw) * ln / 2
        bx_, bz_ = x + math.cos(yaw) * ln / 2, z - math.sin(yaw) * ln / 2
        cyl(rock, (ax_, G.y(ax_, az_) + 0.1, az_), (bx_, G.y(bx_, bz_) + 0.12, bz_), 0.16, "driftwood", sides=8)
        for ex, ez in ((ax_, az_), (bx_, bz_)):
            lathe(rock, ex, ez, [(0, 0), (0.14, 0), (0, 0.001)], "driftwoodDark", segs=8, y0=G.y(ex, ez) + 0.02)
        cyl(rock, (x + 0.1, y + 0.2, z), (x + 0.3, y + 0.42, z + 0.25), 0.04, "driftwoodDark", sides=5, r_end=0.02)
        fern(rock, x + 0.5, G.y(x + 0.5, z + 0.4), z + 0.4, 0.35, brng, pale=True)
    for x, z, r in B["pools"]:
        y = G.y(x, z)
        for k in range(9):
            a = 2 * math.pi * k / 9 + brng.random() * 0.3
            px_, pz_ = x + math.cos(a) * r, z + math.sin(a) * r
            angular(rock, px_, G.y(px_, pz_), pz_, 0.14 + 0.08 * brng.random(), 0.16, brng, "limeCool", "limestoneDark", sink=0.06, npts=8)
        ring = [water.v(x + math.cos(2 * math.pi * k / 10) * r * 0.85, y + 0.05, z + math.sin(2 * math.pi * k / 10) * r * 0.85) for k in range(10)]
        c = water.v(x, y + 0.05, z)
        for v in ring + [c]:
            water.setv(v, "aqua")
        for k in range(10):
            f = water.face((c, ring[k], ring[(k + 1) % 10]), "aqua")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        for k in range(2):
            a = brng.random() * 6.28
            blob(glow, x + math.cos(a) * r * 0.4, y + 0.03, z + math.sin(a) * r * 0.4, 0.05, 0.03, 0.05, "shroomPink" if k else "shroomTeal", cuts=1)
    # (the wreck's rock base: fallen blocks round the boulder it drifted against)
    for x, z, r, h in B["rocks"]:
        angular(rock, x, G.y(x, z), z, r, h, brng, "limeCool", "limestoneDark", sink=0.2, npts=12)
        angular(rock, x + r * 0.9, G.y(x + r * 0.9, z - r * 0.4), z - r * 0.4, r * 0.5, h * 0.5, brng, "limestone", "limestoneDark", sink=0.1, npts=9)
    # (pale cave ferns round the wreck, in the lee of its rocks)
    wx_, wz_ = B["dinghy"][0], B["dinghy"][1]
    for k in range(18):
        a = brng.random() * 6.28
        d = 1.0 + 1.8 * brng.random()
        x, z = wx_ - 0.6 + math.cos(a) * d, wz_ + 1.4 + math.sin(a) * d
        if not G.walk(x, z) or G.y(x, z) < 0.02:
            continue
        fern(rock, x, G.y(x, z), z, 0.26 + 0.2 * brng.random(), brng, pale=True)

    # --- the mining overlook: an overturned, rusted mine cart spilling its ore, a stretch of broken
    # rail, the survey lantern staked into the outcrop over the lake ---
    Sv = L["survey"]
    cx_, cz_, cyaw = Sv["cart"]
    minecart(rock, glow, G, cx_, cz_, cyaw, brng)
    # the alcove's fallen timbers: a cap beam down across the rubble, a post leaning on the rock
    for tx_, tz_, tyaw, tln in Sv["timbers"]:
        a = (tx_ - math.sin(tyaw) * tln / 2, tz_ - math.cos(tyaw) * tln / 2)
        b = (tx_ + math.sin(tyaw) * tln / 2, tz_ + math.cos(tyaw) * tln / 2)
        cyl(rock, (a[0], G.y(*a) + 0.1, a[1]), (b[0], G.y(*b) + 0.1 + 0.35 * (tyaw > 1.0), b[1]), 0.1, "timberDark", sides=6)
    for k in range(10):
        a = brng.random() * 6.28
        px_, pz_ = Sv["rocks"][0][0] + math.cos(a) * (0.6 + brng.random()), Sv["rocks"][0][1] + math.sin(a) * (0.6 + brng.random())
        angular(rock, px_, G.y(px_, pz_), pz_, 0.08 + 0.1 * brng.random(), 0.12, brng, "limeCool", "limestoneDark", sink=0.04, npts=8)
    ox, oz, orr, oh = Sv["outcrop"]
    oy = G.y(ox, oz) + oh * 0.82
    cyl(rock, (ox, oy - 0.3, oz), (ox, oy + 1.15, oz), 0.04, "timberDark", sides=6)
    cyl(rock, (ox, oy + 1.05, oz), (ox - 0.35, oy + 1.05, oz + 0.12), 0.025, "brassDark", sides=5)
    lantern(rock, glow, ox - 0.33, oy + 1.03, oz + 0.12, hang=0.18)
    q = [rock.v(ox + 0.02, oy + 1.12, oz), rock.v(ox + 0.02, oy + 0.9, oz), rock.v(ox + 0.28, oy + 1.0, oz + 0.05)]
    rock.face(q, "redCloth")
    rock.face([rock.v(ox + 0.021, oy + 1.12, oz + 0.002), rock.v(ox + 0.281, oy + 1.0, oz + 0.052), rock.v(ox + 0.021, oy + 0.9, oz + 0.002)], "redCloth")
    add_light(ox - 0.33, oy + 0.9, oz + 0.12, "#FFB347", 1.1, 3.5)

    # --- the fauna's templates (instanced by the game): the glowing cave crab, the swiftlet ---
    crab = Mesh("CV_Glow")
    blob(crab, 0.0, 0.035, 0.0, 0.07, 0.028, 0.055, "crabShell", cuts=1)
    blob(crab, 0.0, 0.058, 0.0, 0.045, 0.012, 0.035, "crabGlow", cuts=1)
    for sx in (-1, 1):
        blob(crab, sx * 0.07, 0.04, 0.055, 0.028, 0.018, 0.022, "crabGlow", cuts=0)
        for k in range(3):
            a = (0.5 + 0.45 * k) * sx
            cyl(crab, (sx * 0.05, 0.03, -0.02 + 0.025 * k), (sx * 0.11, 0.0, -0.04 + 0.035 * k), 0.007, "crabShell", sides=3, cap=False)
        cyl(crab, (sx * 0.02, 0.05, 0.04), (sx * 0.025, 0.08, 0.05), 0.005, "crabGlow", sides=3)
    for f in crab.bm.faces:
        crab.setsmooth(f)
    swift = Mesh("CV_Fauna")
    blob(swift, 0.0, 0.0, 0.0, 0.035, 0.03, 0.09, "swift", cuts=1)
    blob(swift, 0.0, -0.012, 0.01, 0.025, 0.018, 0.06, "swiftBelly", cuts=0)
    for sx in (-1, 1):
        wing = [swift.v(sx * 0.02, 0.005, 0.03), swift.v(sx * 0.24, 0.0, -0.02), swift.v(sx * 0.2, 0.0, -0.07), swift.v(sx * 0.02, 0.005, -0.03)]
        swift.face(wing if sx > 0 else list(reversed(wing)), "swift")
        wing2 = [swift.v(sx * 0.02, 0.002, 0.03), swift.v(sx * 0.02, 0.002, -0.03), swift.v(sx * 0.2, -0.003, -0.07), swift.v(sx * 0.24, -0.003, -0.02)]
        swift.face(wing2 if sx > 0 else list(reversed(wing2)), "swiftBelly")
    tail = [swift.v(0.0, 0.0, -0.08), swift.v(0.05, 0.0, -0.16), swift.v(0.0, 0.0, -0.12), swift.v(-0.05, 0.0, -0.16)]
    swift.face(tail, "swift")

    # --- the foreground frame (the game hangs it along the top of the view): dark limestone
    # stalactites under a ragged lip of rock, 12 m long and tiling end to end ---
    frame = Mesh("CV_Frame")
    frng = random.Random(91)
    lip = []
    for k in range(49):
        u = k / 48
        lip.append((-6.0 + 12.0 * u, -0.25 - 0.18 * (math.sin(u * 2 * math.pi * 3) * 0.5 + math.sin(u * 2 * math.pi * 7 + 1.0) * 0.3)))
    lip[-1] = (6.0, lip[0][1])
    for (ax_, ay_), (bx_, by_) in zip(lip, lip[1:]):
        q = [frame.v(ax_, 0.6, 0.0), frame.v(ax_, ay_, 0.0), frame.v(bx_, by_, 0.0), frame.v(bx_, 0.6, 0.0)]
        for v in q:
            frame.setv(v, "frameRock")
        frame.face(q, "frameRock")
    xk = -5.8
    while xk < 5.8:
        ln = 0.35 + 1.5 * frng.random() ** 1.6
        w = 0.08 + 0.12 * frng.random() + 0.05 * ln
        u = (xk + 6.0) / 12.0
        top = -0.25 - 0.18 * (math.sin(u * 2 * math.pi * 3) * 0.5 + math.sin(u * 2 * math.pi * 7 + 1.0) * 0.3) + 0.08
        lean = (frng.random() - 0.5) * 0.08
        pts = [(xk - w, top), (xk - w * 0.55, top - ln * 0.45), (xk + lean, top - ln), (xk + w * 0.6, top - ln * 0.4), (xk + w, top)]
        vs = [frame.v(px, py, 0.01) for px, py in pts]
        c_ = frame.v(xk, top - ln * 0.2, 0.01)
        for v in vs:
            frame.setv(v, "frameRock")
        frame.setv(vs[2], "frameRockLight")
        frame.setv(c_, "frameRock")
        for a, b in zip(vs, vs[1:]):
            frame.face((c_, a, b), "frameRock")
        xk += 0.18 + 0.45 * frng.random() + w
    for f in frame.bm.faces:
        frame.setsmooth(f)

    for f in glow.bm.faces:
        glow.setsmooth(f)
    finish_object("Frame_Stalactites", frame, coll, bake=False)
    finish_object("Fauna_Crab", crab, coll, bake=False)
    finish_object("Fauna_Swift", swift, coll, bake=False)
    finish_object("caverns_walk_collider", ground, coll, mottle=0.05)
    finish_object("Cave_Rock", rock, coll, mottle=0.08)
    finish_object("Cave_Shell", shell, coll, mottle=0.08)
    finish_object("Cave_Roots", roots, coll, mottle=0.1)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)


# ---------------------------------------------------------------------------------------------
# the export's packing: the static meshes quantized (KHR_mesh_quantization, which three's loader
# reads): positions as 16-bit integers under their node's scale and offset, normals as bytes,
# colours as bytes


def quantize_glb(path, names_prefix=("Cave_", "caverns_walk_collider")):
    import struct

    raw = open(path, "rb").read()
    magic, version, total = struct.unpack_from("<III", raw, 0)
    jlen, jtype = struct.unpack_from("<II", raw, 12)
    js = json.loads(raw[20 : 20 + jlen].decode("utf-8"))
    off = 20 + jlen
    blen, btype = struct.unpack_from("<II", raw, off)
    bin_ = raw[off + 8 : off + 8 + blen]
    views = js["bufferViews"]
    accs = js["accessors"]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    csize = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    fmt = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}

    def read(ai):
        a = accs[ai]
        v = views[a["bufferView"]]
        n = ncomp[a["type"]]
        cs = csize[a["componentType"]]
        stride = v.get("byteStride", n * cs)
        base = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        out = []
        for i in range(a["count"]):
            out.append(struct.unpack_from("<" + fmt[a["componentType"]] * n, bin_, base + i * stride))
        return out

    new_data = {}  # accessor index -> (bytes, byteStride)
    changed = 0
    for node in js["nodes"]:
        if "mesh" not in node or not node.get("name", "").startswith(names_prefix):
            continue
        if any(k in node for k in ("translation", "rotation", "scale", "matrix")) or node.get("children"):
            continue
        mesh = js["meshes"][node["mesh"]]
        pos_ai = [p["attributes"]["POSITION"] for p in mesh["primitives"]]
        pts = [read(ai) for ai in pos_ai]
        lo = [min(p[j] for ps in pts for p in ps) for j in range(3)]
        hi = [max(p[j] for ps in pts for p in ps) for j in range(3)]
        scale = [(hi[j] - lo[j]) / 65535.0 if hi[j] > lo[j] else 1.0 for j in range(3)]
        node["translation"] = lo
        node["scale"] = scale
        for prim in mesh["primitives"]:
            at = prim["attributes"]
            ai = at["POSITION"]
            buf = bytearray()
            qs = []
            for p in read(ai):
                q = [int(round((p[j] - lo[j]) / scale[j])) if hi[j] > lo[j] else 0 for j in range(3)]
                q = [max(0, min(65535, c)) for c in q]
                qs.append(q)
                buf += struct.pack("<HHHH", q[0], q[1], q[2], 0)
            new_data[ai] = (bytes(buf), 8)
            a = accs[ai]
            a["componentType"] = 5123
            a["normalized"] = False
            a["min"] = [min(q[j] for q in qs) for j in range(3)]
            a["max"] = [max(q[j] for q in qs) for j in range(3)]
            if "NORMAL" in at:
                ni = at["NORMAL"]
                buf = bytearray()
                for nx, ny, nz in read(ni):
                    # (under the node's non-uniform scale a normal is stored scaled by it, so the
                    # model's normal matrix (the scale's inverse) turns it back)
                    sx, sy, sz = nx * scale[0], ny * scale[1], nz * scale[2]
                    ln = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0
                    buf += struct.pack("<bbbb", *[max(-127, min(127, int(round(c / ln * 127)))) for c in (sx, sy, sz)], 0)
                new_data[ni] = (bytes(buf), 4)
                b = accs[ni]
                b["componentType"] = 5120
                b["normalized"] = True
                b.pop("min", None)
                b.pop("max", None)
            if "COLOR_0" in at and accs[at["COLOR_0"]]["componentType"] != 5121:
                ci = at["COLOR_0"]
                c = accs[ci]
                n = ncomp[c["type"]]
                div = 65535.0 if c["componentType"] == 5123 else 1.0
                buf = bytearray()
                for comps in read(ci):
                    vals = [max(0, min(255, int(round(x / div * 255)))) for x in comps] + [255] * (4 - n)
                    buf += struct.pack("<BBBB", *vals[:4])
                new_data[ci] = (bytes(buf), 4)
                c["componentType"] = 5121
                c["normalized"] = True
                c["type"] = "VEC4"
        changed += 1
    if not changed:
        return {"quantized": 0}
    # the new binary: every view still read kept, the replaced ones dropped, the new ones appended
    used = {}
    for i, a in enumerate(accs):
        if i not in new_data and "bufferView" in a:
            used.setdefault(a["bufferView"], True)
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            if "indices" in p and p["indices"] not in new_data:
                used.setdefault(accs[p["indices"]]["bufferView"], True)
    out = bytearray()
    remap = {}
    new_views = []
    for vi, v in enumerate(views):
        if vi not in used:
            continue
        while len(out) % 4:
            out += b"\0"
        start = v.get("byteOffset", 0)
        chunk_ = bin_[start : start + v["byteLength"]]
        nv = dict(v)
        nv["byteOffset"] = len(out)
        out += chunk_
        remap[vi] = len(new_views)
        new_views.append(nv)
    for ai, (data, stride) in new_data.items():
        while len(out) % 4:
            out += b"\0"
        new_views.append({"buffer": 0, "byteOffset": len(out), "byteLength": len(data), "byteStride": stride, "target": 34962})
        out += data
        accs[ai]["bufferView"] = len(new_views) - 1
        accs[ai]["byteOffset"] = 0
    for i, a in enumerate(accs):
        if i not in new_data and "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    while len(out) % 4:
        out += b"\0"
    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(out)}]
    for key in ("extensionsUsed", "extensionsRequired"):
        lst = js.setdefault(key, [])
        if "KHR_mesh_quantization" not in lst:
            lst.append("KHR_mesh_quantization")
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    while len(jb) % 4:
        jb += b" "
    total = 12 + 8 + len(jb) + 8 + len(out)
    blob_ = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    open(path, "wb").write(blob_)
    return {"quantized": changed, "bytes": len(blob_)}


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
    static = {k: v for k, v in out.items() if not k.startswith(("Ore_", "Fauna_", "Frame_"))}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "verts": sum(v["verts"] for v in out.values()), "staticDrawCalls": sum(v["materials"] for v in static.values())}


def main():
    report = globals().get("REPORT_PATH")
    # (CAVERNS_NO_STUDIO: a trial run that neither opens nor saves the studio's master file)
    solo = bool(os.environ.get("CAVERNS_NO_STUDIO") or globals().get("NO_STUDIO"))
    try:
        root = repo_root()
        if not solo:
            studio(root, "begin")
        coll, L, ores = build(root)
        out = os.environ.get("CAVERNS_OUT") or globals().get("CAVERNS_OUT") or os.path.join(root, "client", "public", "models", "caverns.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        exported = os.path.getsize(out)
        packed = quantize_glb(out)
        result = {"ok": True, "glb": out, "exported": exported, "bytes": os.path.getsize(out), "packed": packed, **summary(coll), "geology": dict(GEO_STATS)}
        # (the ore templates sit at the origin: not in the studio's grid)
        for o in list(coll.all_objects):
            if o.name.startswith(("Ore_", "Fauna_", "Frame_")):
                bpy.data.objects.remove(o, do_unlink=True)
        if not solo:
            result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
