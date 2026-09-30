"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb.

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
caverns-terrain` writes it from caverns.ts; `npm run check-layout` fails while it is stale).

A subterranean karst, dark and damp: weathered limestone bedrock, fractured slate and compacted cave
silt underfoot (fine river sediment only in a band a metre or so wide round the cenote, dark and wet
where the water laps), the north and west walls rising into the vault's broken lip, the east wall one
towering cliff of hexagonal basalt columns with the ore nodes nested in hollow vugs in its face, the
Travertine Terraces' rimstone dams growing out of the west buttress, the cenote with its islet, a
wreck on the south-west shore and an overturned mine cart at the east cliff's foot, cairns at the
trails' junctions. The Basalt Crucible Forge and its flagstone workshop (the anvil, the chisel rack,
the tool crate) are carried over as they were built.

One mesh per finish:

    caverns_walk_collider  CV_Clay   the floor, which is the game's click collider too: the walk
                                     grid's triangles exactly (cavernsFloorY, triangle for triangle;
                                     only the terraces' pools carved), painted by what they are
    Cave_Rock       CV_Clay          the rock (boulders, outcrops, the doline's mounds, stalagmites,
                                     talus, the islet's crag, the nodes' host rock), the Expedition
                                     Basecamp, the forge alcove, the adit's timbers and rails, the
                                     terraces' rimstone dams, the wreck, the mine cart, the cairns
    Cave_Shell      CV_Shell         the north and west walls and their vault's lip, the pedestal's
                                     skirt round the diorama's edge; double sided
    Cave_Roots      CV_Occluder      the east basalt cliff and the banyan's roots on the islet (both
                                     dithered where they stand between you and the camera)
    Cave_Glow       CV_Glow          what glows: the crystals (amethyst and cyan), the fungi, the
                                     lanterns, the forge's fire and runes, the specimens
    Cave_Water      CV_Water         the cenote's surface
    Cave_Thermal    CV_ThermalWater  the terraces' warm water and its cascades

and the templates the game instances: the ore nodes' rocks (Ore_<kind>, Ore_<kind>_Glow, Ore_Rubble),
the glowing cave crab and the swiftlet (Fauna_Crab, Fauna_Swift). The export is packed
(`quantize_glb`, KHR_mesh_quantization): under 1.8 MB.

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
FINISHES = {"CV_Clay": 0.88, "CV_Shell": 0.92, "CV_Glow": 0.6, "CV_Water": 0.15, "CV_ThermalWater": 0.25, "CV_Occluder": 0.86, "CV_OreRock": 0.8, "CV_OreGlow": 0.55, "CV_Fauna": 0.8}
DOUBLE_SIDED = {"CV_Shell", "CV_Water", "CV_ThermalWater", "CV_Fauna"}
ORE_RADII = {}
LAYOUT = {}
GEO_STATS = {}

C = {
    # the floor: weathered limestone bedrock, fractured slate, compacted cave silt
    "bedrock": "#383B42",
    "bedrockLight": "#464A52",
    "bedrockDark": "#2E3137",
    "slateSeam": "#23252A",
    "slate": "#33363D",
    "silt": "#3D3933",
    "siltDark": "#322F2A",
    "trampled": "#2F2E2C",
    "basaltFloor": "#2F3036",
    "basaltFloorLight": "#3A3B42",
    # the sunlit doline's moss
    "mossDeep": "#34502A",
    "moss": "#4A6B35",
    "mossLight": "#6A8A42",
    # the river sediment round the cenote, and its bed
    "sedimentDry": "#6E6452",
    "sediment": "#5C5446",
    "sedimentWet": "#403A31",
    "sandGold": "#5C5446",
    "bedShallow": "#4A7A72",
    "bedMid": "#1D5A5A",
    "bedDeep": "#0A2C38",
    # the walls
    "limestone": "#6A6C71",
    "limestoneLight": "#83847F",
    "limestoneDark": "#4D4F55",
    "limeCool": "#77787A",
    "wallFoot": "#2C2E33",
    "vault": "#25272C",
    "vug": "#121015",
    "skirt": "#26282D",
    "skirtDark": "#18191D",
    "strata": "#57534C",
    "strataDark": "#48443E",
    # the east cliff's basalt
    "basaltCol": "#34343C",
    "basaltColLight": "#43434C",
    "basaltTop": "#5E5C66",
    # the terraces
    "travertine": "#B5AC98",
    "travertineShadow": "#8C8476",
    "rimstone": "#CBC2AD",
    "flowstone": "#A69C88",
    "flowstoneWarm": "#B8A98C",
    "thermalWater": "#8FE3D8",
    # water
    "aqua": "#38C2C4",
    "aquaShallow": "#8FE0D4",
    "aquaDeep": "#0F5F7C",
    "waterDark": "#27424A",
    "foam": "#E6F2EE",
    # crystals, fungi, what glows
    "cyan": "#00F5D4",
    "violet": "#7B2CBF",
    "cyanSoft": "#6FFFE6",
    "violetSoft": "#A66BE0",
    "fungusTeal": "#4FFFD2",
    "fungusViolet": "#B98CFF",
    "shroomStem": "#CFC8BC",
    "lantern": "#FFB347",
    "lanternHot": "#FFD58A",
    "forgeCore": "#FFD27A",
    "ember": "#FF8A3A",
    "emberDeep": "#B8320E",
    "magma": "#FF5A1F",
    "magmaHot": "#FFC05A",
    "runeFire": "#FF9A3C",
    "runeGlow": "#B36BFF",
    "crabShell": "#1F8E86",
    "crabGlow": "#8FFFF0",
    "swift": "#3A332E",
    "swiftBelly": "#8C7B68",
    # plants
    "fern": "#4F8A3A",
    "fernLight": "#7DB352",
    "fernPale": "#A3AE95",
    "fernPaleLight": "#C8D0BB",
    "reedPale": "#ADA686",
    "reedPaleDark": "#857F63",
    "banyan": "#6E6052",
    "banyanDark": "#4E4238",
    # wood, metal, cloth, stone work
    "timber": "#7A5536",
    "timberDark": "#5A3D27",
    "plank": "#9C7148",
    "driftwood": "#8E857A",
    "driftwoodDark": "#686057",
    "boatWood": "#6E6356",
    "boatPlank": "#857866",
    "boatWoodDark": "#4E463E",
    "algae": "#34472F",
    "iron": "#3A3836",
    "steel": "#8E949C",
    "leather": "#6B4228",
    "cloth": "#C9B79A",
    "canvas": "#C8B894",
    "canvasShade": "#A8977A",
    "brass": "#C9A24A",
    "brassDark": "#8C6B2A",
    "glass": "#CFE3E0",
    "redCloth": "#B3403A",
    "cartRust": "#9A5A30",
    "cartRustDark": "#6E3E22",
    "rustDark": "#5C3420",
    "tunnel": "#0D0C11",
    "stoneDark": "#4A4550",
    "flagstone": "#8A8172",
    "flagstoneDark": "#6A6256",
    "meteorite": "#3A3438",
    # the forge's basalt and fire
    "basalt": "#2E2C33",
    "basaltLight": "#48454F",
    "basaltDeep": "#16151B",
    "slag": "#2E3A36",
    "slagViolet": "#3B2F42",
    "charcoal": "#141315",
    # the ore templates
    "coal": "#1E1C20",
    "coalChunk": "#16151A",
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
    "slateWet": "#2C3340",
    "monolith": "#2B2433",
    "monolithEdge": "#3C3348",
    "rubble": "#2F2B30",
    "rubbleCrack": "#1A181C",
    "sand": "#6E6452",
}

def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    """A colour (a hex, or a name from C) in linear rgb."""
    h = (hex_color if hex_color.startswith("#") else C[hex_color]).lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


def mixc(a, b, t):
    ca = lin(a) if isinstance(a, str) else a
    cb = lin(b) if isinstance(b, str) else b
    t = max(0.0, min(1.0, t))
    return tuple(ca[i] + (cb[i] - ca[i]) * t for i in range(3))


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


def read_terrain(root):
    path = os.path.join(root, "scripts", "blender", "data", "caverns_terrain.json")
    return json.load(open(path, encoding="utf-8"))

_game = G  # (the builders' `G` parameter is the ground: this is the point converter)

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


def frange(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * k / n for k in range(n + 1)]

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


def angular(M, x, y, z, r, h, rng, top, side, sink=0.2, squash=0.85, npts=12):
    """A fractured limestone block: an angular hull, flat faceted faces, lighter where it faces up."""
    for f in chunk(M, r, h, rng, sink=sink, squash=squash, at=(x, y, z), npts=npts):
        f.normal_update()
        M.setf(f, top if f.normal.z > 0.45 else side)


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
# the light painted in: the lamps and the fires only (the game lights the cavern itself)

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
    """The model's own base light: even, a touch dimmer up the walls' heights (the game's own lights,
    the doline's sun and its shadows, give the cavern its depth)."""
    x, y, z = p
    fade = 1 - 0.18 * smooth(5.0, 10.0, y)
    return (0.94 * fade, 0.95 * fade, 0.98 * fade)


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


def lake_factor(L, x, z):
    """How far out on the lake a point is against its shore (shared/worlds/caverns.ts lakeFactor):
    under 1 the water, 1 the waterline."""
    lk = L["lake"]
    dx, dz = (x - lk["x"]) / lk["rx"], (z - lk["z"]) / lk["rz"]
    a = math.atan2(dz, dx)
    wob = 1 + 0.08 * math.sin(2 * a + 0.4) + 0.06 * math.sin(3 * a + 0.7) + 0.04 * math.sin(5 * a + 2.1) + 0.025 * math.sin(9 * a + 1.3)
    return math.hypot(dx, dz) / wob

# ---------------------------------------------------------------------------------------------
# small things: ferns, lanterns, the tarp, crystals, fungi, cairns


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


def lantern(rock, glow, x, y, z, hang=0.3):
    """An oil lantern hung from its hook: the wire, the glowing globe, its cap."""
    cyl(rock, (x, y, z), (x, y - hang, z), 0.01, "iron", sides=4)
    lathe(glow, x, z, [(0, 0), (0.06, 0.02), (0.08, 0.1), (0.06, 0.19), (0, 0.2)], "lanternHot", segs=8, y0=y - hang - 0.2)
    lathe(rock, x, z, [(0, 0), (0.07, 0.0), (0.03, 0.05), (0, 0.06)], "iron", segs=6, y0=y - hang)


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


def crystal_cluster(glow, rock, x, y, z, s, rng, lean_to=None):
    """A cluster of crystals (amethyst and cyan) out of a dark socket of rock."""
    angular(rock, x, y, z, 0.3 * s, 0.22 * s, rng, "glimmerBase", "vug", sink=0.1, npts=9)
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.random() * 0.6
        lean = 0.2 + 0.45 * rng.random()
        d = (math.cos(a) * lean, 1.0, math.sin(a) * lean)
        if lean_to:
            d = (d[0] + lean_to[0] * 0.8, d[1], d[2] + lean_to[1] * 0.8)
        colr = "violet" if (k + int(abs(x) * 3)) % 3 == 0 else "cyan"
        prism(glow, (x + math.cos(a) * 0.1 * s, y + 0.04, z + math.sin(a) * 0.1 * s), d, (0.045 + 0.04 * rng.random()) * s, (0.3 + 0.6 * rng.random()) * s, colr if k % 2 else colr + "Soft", sides=5)


def fungi(rock, glow, x, y, z, s, rng):
    """A patch of bioluminescent fungi: pale stems, glowing caps."""
    for k in range(4 + int(3 * rng.random())):
        a = rng.random() * 6.283
        d = 0.22 * s * rng.random()
        px, pz = x + math.cos(a) * d, z + math.sin(a) * d
        h = (0.06 + 0.12 * rng.random()) * s
        cyl(rock, (px, y - 0.02, pz), (px, y + h, pz), 0.012 * s, "shroomStem", sides=4, cap=False)
        blob(glow, px, y + h, pz, 0.045 * s, 0.018 * s, 0.045 * s, "fungusTeal" if k % 3 else "fungusViolet", cuts=0)


def lump(M, x, y, z, rx, ry, rz, rng, colour, subdiv=1, rough=0.3, sink=0.3):
    """A weathered block of rock: an icosphere broken by noise into rugged flat facets, its foot sunk
    into the floor and flattened there; `colour(x, y, z, up)` paints each facet by where it is and
    which way it faces."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    seed = rng.randrange(1000)
    sq = 0.75 + 0.3 * rng.random()
    new = [v for v in bm.verts if not v.tag]
    for v in new:
        d = v.co.normalized()
        gx, gy, gz = d.x, d.z, -d.y
        k = 1 + rough * fbm(gx * 1.7 + seed, gy * 1.7, gz * 1.7, seed) + 0.12 * fbm(gx * 4.3, gy * 4.3 + seed, gz * 4.3, seed + 3)
        # (a flatter top, a squarer shoulder: a block, not a pebble)
        gy = gy * sq if gy > 0 else gy
        px, py, pz = x + gx * rx * k, y + (gy * 0.5 + 0.5) * ry * k - sink * ry, z + gz * rz * k
        v.co = W(px, max(py, y - sink * ry), pz)
    faces = list({f for v in new for f in v.link_faces})
    for f in faces:
        f.normal_update()
        c = _game(f.calc_center_median())
        M.setf(f, colour(c[0], c[1], c[2], f.normal.z))
    for v in bm.verts:
        v.tag = False


def rock_colour(moss=0.0, base="limestone", dark="limestoneDark"):
    """A lump's paint: its beds, its dark foot, and moss on its top where the sun falls."""
    def paint(x, y, z, up):
        n1 = fbm(x * 0.9, y * 0.9, z * 0.9, 71)
        band = 0.5 + 0.5 * math.sin(y * 6.0 + n1 * 2.4)
        c = mixc(dark, base, 0.35 + 0.5 * band)
        c = mixc(c, "strata", max(0.0, fbm(x * 1.8, y * 1.8, z * 1.8, 73)) * 0.4)
        c = mixc(c, "wallFoot", smooth(0.1, -0.5, up) * 0.6)
        if moss > 0:
            m = smooth(0.35, 0.8, up) * smooth(-0.1, 0.25, n1 + 0.3 * fbm(x * 3, y * 3, z * 3, 77))
            c = mixc(c, mixc("mossDeep", "moss", 0.5 + 0.5 * n1), m * moss)
        return c
    return paint


def hex_column(M, x, y, z, r, h, rng, side="basaltCol"):
    """A column of basalt: a crisp hexagonal prism (turned at random), flat-sided, its top a fracture:
    tilted, and now and then broken into a step."""
    rot = rng.random() * math.pi / 3
    ring0 = [(x + r * math.cos(rot + math.pi * k / 3), z + r * math.sin(rot + math.pi * k / 3)) for k in range(6)]
    tilt = (0.08 + 0.22 * rng.random()) * r
    ta = rng.random() * 6.283
    tops = [h + tilt * math.cos(math.pi * k / 3 + ta) for k in range(6)]
    lo = [M.v(px, y, pz) for px, pz in ring0]
    hi = [M.v(px, y + t, pz) for (px, pz), t in zip(ring0, tops)]
    centre = Vector(W(x, y, z))
    for k in range(6):
        k1 = (k + 1) % 6
        f = M.face((lo[k1], lo[k], hi[k], hi[k1]), side)
        f.normal_update()
        if f.normal.dot((lo[k].co + lo[k1].co) / 2 - centre) < 0:
            f.normal_flip()
    f = M.face(list(hi), "basaltTop")
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    if rng.random() < 0.3 and h > 1.2:
        r2 = r * 0.6
        ox, oz = r * 0.25 * math.cos(ta), r * 0.25 * math.sin(ta)
        top_ = min(tops)
        drum = [(x + ox + r2 * math.cos(rot + math.pi * k / 3), z + oz + r2 * math.sin(rot + math.pi * k / 3)) for k in range(6)]
        lo2 = [M.v(px, y + top_ - 0.05, pz) for px, pz in drum]
        hi2 = [M.v(px, y + top_ + 0.2 + 0.2 * rng.random() + 0.05 * math.sin(k), pz) for k, (px, pz) in enumerate(drum)]
        c2 = Vector(W(x + ox, y, z + oz))
        for k in range(6):
            k1 = (k + 1) % 6
            f = M.face((lo2[k1], lo2[k], hi2[k], hi2[k1]), side)
            f.normal_update()
            if f.normal.dot((lo2[k].co + lo2[k1].co) / 2 - c2) < 0:
                f.normal_flip()
        f = M.face(list(hi2), "basaltTop")
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()


def cairn(rock, G, x, z, s, rng):
    """A trail cairn: three or four flat stones stacked, each a little smaller and turned."""
    y = G.y(x, z)
    for k in range(3 + (1 if s > 0.5 else 0)):
        w = s * (0.62 - 0.12 * k)
        h = s * 0.24
        y0 = y + (0.0 if k == 0 else 0.02)
        lump(rock, x + (rng.random() - 0.5) * 0.04, y0, z + (rng.random() - 0.5) * 0.04, w, h, w * (0.75 + 0.2 * rng.random()), rng, rock_colour(base="limeCool", dark="limestoneDark"), rough=0.12, sink=0.05)
        y = y0 + h * 0.95


# ---------------------------------------------------------------------------------------------
# the floor: the walk collider, painted; the pedestal's skirt round its edge


def water_distance(G, L):
    """Each floor vertex's distance (m) to the cenote's water (a chamfer pass over the grid)."""
    n, cell = G.n, G.cell
    wy = L["lake"]["water"]
    INF = 1e9
    d = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            d.append(0.0 if G.h[k * n + i] < wy - 0.005 and lake_factor(L, x, z) < 1.1 else INF)
    r2 = 1.4142
    for k in range(n):
        for i in range(n):
            q = k * n + i
            b = d[q]
            if i > 0:
                b = min(b, d[q - 1] + 1)
            if k > 0:
                b = min(b, d[q - n] + 1)
                if i > 0:
                    b = min(b, d[q - n - 1] + r2)
                if i < n - 1:
                    b = min(b, d[q - n + 1] + r2)
            d[q] = b
    for k in range(n - 1, -1, -1):
        for i in range(n - 1, -1, -1):
            q = k * n + i
            b = d[q]
            if i < n - 1:
                b = min(b, d[q + 1] + 1)
            if k < n - 1:
                b = min(b, d[q + n] + 1)
                if i < n - 1:
                    b = min(b, d[q + n + 1] + r2)
                if i > 0:
                    b = min(b, d[q + n - 1] + r2)
            d[q] = b
    return [v * cell for v in d]


def floor_colour(L, x, y, z, s, wd):
    """A floor vertex's colour by what it is (the grid's surface): weathered bedrock, slate seams and
    silt everywhere; moss where the doline's sun falls; the trails trampled a shade darker; the
    travertine round the pools; the chasm's basalt; the lake's bed; and the fine river sediment only
    in its band along the water."""
    wy = L["lake"]["water"]
    n1 = fbm(x * 0.4, 0.3, z * 0.4, 11)
    n2 = fbm(x * 1.5, 0.7, z * 1.5, 13)
    n3 = fbm(x * 3.1, 1.1, z * 3.1, 17)
    if s == 7:  # the lake's bed: wet sediment to the shallows' teal to the deep
        depth = wy - y
        c = mixc("sedimentWet", "bedShallow", smooth(0.02, 0.35, depth))
        c = mixc(c, "bedMid", smooth(0.35, 1.1, depth))
        return mixc(c, "bedDeep", smooth(1.1, 2.3, depth))
    c = mixc("bedrock", "bedrockLight", 0.5 + 0.5 * n1)
    c = mixc(c, "silt", smooth(-0.1, 0.35, n2) * 0.55)
    c = mixc(c, "bedrockDark", smooth(0.2, 0.5, -n3) * 0.35)
    # (fractured slate: thin dark seams through the bedrock)
    seam = smooth(0.045, 0.0, abs(fbm(x * 0.8 + 3.1, 2.0, z * 0.8, 23)))
    if s == 1:  # the doline, under the sun: layered moss over the bedrock, never a lawn
        m = smooth(-0.05, 0.3, n1 + 0.4 * n3)
        c = mixc(c, mixc("mossDeep", "moss", 0.5 + 0.5 * n2), m * 0.8)
        c = mixc(c, "mossLight", smooth(0.3, 0.55, n3) * m * 0.4)
        seam *= 0.4
    elif s == 2:  # the explorer's trails: the same ground, trampled a shade darker
        c = mixc(c, "trampled", 0.3 + 0.15 * (0.5 + 0.5 * n3))
        seam *= 0.5
    elif s == 4:  # the shelf's fractured slate
        c = mixc(c, "slate", 0.6)
        seam = min(1.0, seam * 1.6)
    elif s == 5:  # the chasm's basalt floor
        c = mixc("basaltFloor", "basaltFloorLight", 0.5 + 0.5 * n1)
        seam *= 0.6
    elif s == 6:  # the travertine round the pools
        c = mixc("travertine", "travertineShadow", 0.5 + 0.5 * n2)
        seam = 0.0
    elif s == 8:  # the overlook's pavement: paler bedrock, its grikes dark
        c = mixc(c, "bedrockLight", 0.4)
        seam = max(seam, smooth(0.5, 0.65, abs(n3)) * 0.8)
    elif s == 0:  # the slopes: the beds of the rock showing
        c = mixc(c, "strataDark", (0.5 + 0.5 * math.sin(y * 6.5 + n1 * 3.0)) * 0.35)
    c = mixc(c, "slateSeam", seam * 0.75)
    # the river sediment, only along the water: a band a metre or so wide, dark and wet at the lap
    band = 1.15 + 0.35 * n2
    if wd < band + 0.35 and s not in (5, 6):
        sand = mixc("sedimentDry", "sediment", 0.5 + 0.5 * n3)
        sand = mixc(sand, "sedimentWet", smooth(0.7, 0.0, wd))
        c = mixc(c, sand, smooth(band + 0.35, band - 0.15, wd))
    return c


def build_floor(G, L, ground, shell):
    """The floor, which is also the walk collider (caverns_walk_collider): the walk grid's very
    triangles, painted; the terraces' pools carved into it; the pedestal's skirt down its edge."""
    n = G.n
    wd = water_distance(G, L)
    pools = [pool_outline(G, pi, pi * 1.7 + 0.3) for pi in range(len(G.pools))]
    cols = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            q = k * n + i
            cols.append(floor_colour(L, x, G.h[q], z, G.s[q], wd[q]))
    # (one light blur over the neighbours: a patch of moss or the sediment's band fades into the next)
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
            h = G.h[q]
            for pi, ((cx, cz, rx, rz), out) in enumerate(pools):
                if inside_poly(x, z, out):
                    h = min(h, G.pools[pi]["y"] - 0.38)
            v = ground.v(x, h, z)
            ground.setv(v, cols[q])
            verts.append(v)
    # (split along each cell's (-x, -z) to (+x, +z) diagonal: cavernsFloorY's very triangles)
    for k in range(n - 1):
        for i in range(n - 1):
            a, b = verts[k * n + i], verts[k * n + i + 1]
            c, dv = verts[(k + 1) * n + i], verts[(k + 1) * n + i + 1]
            for tri in ((a, dv, b), (a, c, dv)):
                ground.setsmooth(ground.face(tri, "bedrock"))
    # the pedestal's skirt: the floor's edge carried two metres straight down, all the way round
    edges = [[(i, 0) for i in range(n)], [(i, n - 1) for i in range(n)], [(0, k) for k in range(n)], [(n - 1, k) for k in range(n)]]
    for e in edges:
        prev = None
        for i, k in e:
            x, z = G.at(i, k)
            y = G.h[k * n + i]
            top = shell.v(x, y, z)
            bot = shell.v(x, y - 2.0, z)
            shell.setv(top, "skirt")
            shell.setv(bot, "skirtDark")
            if prev:
                shell.setsmooth(shell.face((prev[0], top, bot, prev[1]), "skirt"))
            prev = (top, bot)
    # the cenote's surface over every cell its water shows in
    K = L["lake"]
    wy = K["water"]
    wv = {}

    def wvert(i, k):
        if (i, k) not in wv:
            x, z = G.at(i, k)
            depth = wy - G.h[k * n + i]
            v = WATER.v(x, wy, z)
            WATER.setv(v, mixc(mixc("aquaShallow", "aqua", smooth(0.1, 0.8, depth)), "aquaDeep", smooth(0.9, 2.2, depth)))
            wv[(i, k)] = v
        return wv[(i, k)]

    for k in range(n - 1):
        for i in range(n - 1):
            hs = [G.h[kk * n + ii] for ii, kk in ((i, k), (i + 1, k), (i, k + 1), (i + 1, k + 1))]
            x, z = G.at(i, k)
            if min(hs) > wy - 0.02 or math.hypot((x - K["x"]) / K["rx"], (z - K["z"]) / K["rz"]) > 1.4:
                continue
            q = [wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)]
            WATER.setsmooth(WATER.face(q, "aqua"))


WATER = None


# ---------------------------------------------------------------------------------------------
# the walls: the north and west cliffs of limestone rising into the vault's broken lip, pockets
# (vugs) hollowed round the ore nodes set in them, the adit's mouth and the forge's alcove open in
# the north wall


def wall_nodes(L):
    """The nodes set in the north and west walls: (along, their u, their height, the pocket's size)."""
    out = []
    for nd in L["nodes"]:
        if nd["kind"] == "monolith":
            continue
        r = ORE_RADII.get(nd["kind"], 0.5)
        if nd["z"] < -21.0:
            out.append(("x", nd["x"], nd, r))
        elif nd["x"] < -21.0:
            out.append(("z", nd["z"], nd, r))
    return out


def wall_point(G, L, along, u, v, pockets):
    """A point of a wall's face: `u` along it, `v` up it (0 its foot, 1 its lip). The face stands in
    from the boundary: a damp foot, leaning back, bellied by its beds, and the vault's lip overhanging
    (less over the doline, where the roof fell in); hollowed round the nodes set in it. Returns the
    point and how deep in a pocket it lies (0..1)."""
    half = L["half"]
    uc = max(-half + 0.1, min(half - 0.1, u))
    fx, fz = (uc, -half + 0.6) if along == "x" else (-half + 0.6, uc)
    foot = G.y(fx, fz) - 0.45
    doline = along == "x" and -9.5 < u < 11.5
    H = 8.4 + 1.6 * fbm(u * 0.11, 0.0, 3.0, 41) - (1.0 if doline else 0.0)
    y = foot + v * H
    lip = 0.5 if doline else 1.6
    inset = 0.15 + 0.4 * (1 - smooth(0.0, 0.2, v)) - 0.4 * smooth(0.18, 0.5, v) * (1 - smooth(0.55, 0.85, v)) + lip * smooth(0.78, 1.0, v)
    inset += 0.4 * fbm(u * 0.32, y * 0.3, 0.7, 43) + 0.13 * fbm(u * 1.2, y * 1.1, 1.3, 47)
    # (the adit's mouth set in a buttress of rock that stands forward to meet its bore)
    A = L["adit"]
    if along == "x":
        inset += 0.8 * smooth(A["w"] / 2 + 1.8, A["w"] / 2 + 0.2, abs(u - A["x"])) * (1 - smooth(0.25, 0.5, v))
    pocket = 0.0
    for al, nu, nd, r in pockets:
        if al != along:
            continue
        ny = G.y(nd["x"], nd["z"]) + r * 0.7
        R = r + 0.75
        d = math.hypot(u - nu, (y - ny) * 0.85)
        if d < R:
            t = 1 - (d / R) ** 2
            inset -= 0.85 * t
            pocket = max(pocket, smooth(0.25, 0.7, t))
    p = (u, y, -half + inset) if along == "x" else (-half + inset, y, u)
    return p, pocket


def wall_colour(u, y, v, pocket):
    band = 0.5 + 0.5 * math.sin(y * 3.1 + fbm(u * 0.2, y * 0.2, 0.0, 51) * 2.5)
    c = mixc("limestoneDark", "limestone", 0.15 + 0.7 * band)
    c = mixc(c, "limestoneLight", smooth(0.35, 0.8, fbm(u * 0.5, y * 0.5, 2.0, 53)) * 0.35)
    c = mixc(c, "strataDark", smooth(0.3, 0.6, fbm(u * 1.4, y * 2.6, 4.0, 55)) * 0.3)
    c = mixc(c, "wallFoot", smooth(0.22, 0.0, v) * 0.85)
    c = mixc(c, "vault", smooth(0.72, 1.0, v) * 0.75)
    return mixc(c, "vug", pocket)


def build_walls(G, L, shell, rock, glow, rng):
    half = L["half"]
    A = L["adit"]
    F = L["forge"]
    ady = G.y(A["x"], -half + 1.0)
    fdy = G.y(F["x"], F["z"])
    hw = A["w"] / 2
    pockets = wall_nodes(L)
    V = 18
    us = frange(-half - 1.0, half + 0.5, 0.5)
    for along in ("x", "z"):
        grid = []
        for u in us:
            col = []
            for j in range(V + 1):
                p, pk = wall_point(G, L, along, u, j / V, pockets)
                vv = shell.v(*p)
                shell.setv(vv, wall_colour(u, p[1], j / V, pk))
                col.append(vv)
            grid.append(col)
        for a in range(len(us) - 1):
            for j in range(V):
                if along == "x":
                    um = (us[a] + us[a + 1]) / 2
                    ym = (grid[a][j].co.z + grid[a][j + 1].co.z) / 2
                    # (the adit's arch and the forge's alcove open in the north wall)
                    if abs(um - A["x"]) < hw + 0.15 and ym < ady + A["h"] + 0.1 - (0.0 if abs(um - A["x"]) < hw * 0.6 else 0.35):
                        continue
                    if abs(um - F["x"]) < F["w"] / 2 + 0.25 - 0.12 * max(0.0, ym - fdy - F["h"]) and ym < fdy + F["h"] + 1.4:
                        continue
                q = (grid[a][j], grid[a + 1][j], grid[a + 1][j + 1], grid[a][j + 1])
                shell.setsmooth(shell.face(q if along == "x" else tuple(reversed(q)), "limestone"))
    # the vugs' crystals: amethyst and cyan growing round each pocket's rim, out of the dark
    for al, nu, nd, r in pockets:
        ny = G.y(nd["x"], nd["z"]) + r * 0.7
        R = r + 0.55
        for k in range(7):
            a = 2 * math.pi * k / 7 + rng.random() * 0.5
            du, dy = math.cos(a) * R, math.sin(a) * R * 1.1
            if ny + dy < G.y(nd["x"], nd["z"]) + 0.05:
                continue
            if al == "x":
                base = (nu + du, ny + dy, -half + 0.2)
                d = (math.cos(a) * 0.3, 0.4 + 0.3 * math.sin(a), 0.9)
            else:
                base = (-half + 0.2, ny + dy, nu + du)
                d = (0.9, 0.4 + 0.3 * math.sin(a), math.cos(a) * 0.3)
            colr = "violet" if (k + int(nu)) % 3 == 0 else "cyan"
            prism(glow, base, d, 0.035 + 0.025 * rng.random(), 0.22 + 0.25 * rng.random(), colr, sides=5)
    # the adit: its dark bore into the hill, timber sets propping its mouth, lagging over their caps,
    # the rails running out on sleepers, a lantern hung from the first cap
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
    rock.face(list(reversed(rings_[-1])), "tunnel")
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


# ---------------------------------------------------------------------------------------------
# the east wall: one towering cliff of hexagonal basalt columns, stepped into terraces where they
# broke, the nodes along it nested in hollow vugs in its face, crystals in its fractures


def build_east_cliff(G, L, roots, glow, rock, rng):
    half = L["half"]
    east = [(nd["x"], nd["z"], ORE_RADII.get(nd["kind"], 0.5)) for nd in L["nodes"] if nd["x"] > 20.3 and nd["kind"] != "monolith"]
    fr = [(f[0], f[1]) for f in L["fractures"]]
    s = 0.7
    made = 0
    for j, cx0 in enumerate((22.3, 22.92, 23.54, 24.16)):
        z = -half - 0.5 + (s / 2 if j % 2 else 0.0)
        while z < half + 0.5:
            # the cliff's profile: towering in the north, stepping down toward the lake; each rank
            # further back a terrace higher; heights broken into steps
            # (low along the lake's east shore, where the camera looks over it from the south-east)
            H = 0.85 + 6.8 * (1 - smooth(-7.0, 5.0, z)) + (0.95 if z < 3.0 else 0.28) * j + (0.9 if z < 3.0 else 0.35) * fbm(z * 0.3, j * 0.7, 0.0, 61)
            H = max(0.7, round(H / 0.3) * 0.3 + 0.08 * rng.random())
            pocket = any(abs(z - pz) < pr + 0.45 for px, pz, pr in east) and j <= 1
            crack = any(abs(z - fz) < 0.3 for fx_, fz in fr) and j == 0
            x = cx0 + 0.05 * (rng.random() - 0.5)
            gy = G.y(min(x, half - 0.1), z)
            if pocket:
                # (the vug: the front ranks cut away round the node, low stubs left at its sill)
                if j == 0:
                    hex_column(roots, x, gy - 0.4, z, s * 0.6, 0.55, rng)
                    made += 1
            elif not crack:
                hex_column(roots, x, gy - 0.4, z, s * 0.6, H + 0.4, rng, "basaltCol" if rng.random() < 0.65 else "basaltColLight")
                made += 1
            z += s
    GEO_STATS["basaltColumns"] = made
    # each vug's dark back and its crystals (amethyst and cyan, glowing from within)
    for px, pz, pr in east:
        gy = G.y(min(px, half - 0.1), pz)
        R = pr + 0.55
        ring = [roots.v(23.35, gy + 0.2 + R * (0.9 + 0.9 * math.sin(a)), pz + R * math.cos(a)) for a in (math.pi * k / 8 for k in range(-4, 13))]
        mid = roots.v(23.5, gy + 0.9, pz)
        for v in ring + [mid]:
            roots.setv(v, "vug")
        for a_, b_ in zip(ring, ring[1:]):
            f = roots.face((mid, a_, b_), "vug")
            f.normal_update()
            if f.normal.x > 0:
                f.normal_flip()
        for k in range(9):
            a = math.pi * (k / 8.0) * 1.6 - 0.3
            base = (22.95, gy + 0.3 + R * (0.8 + 0.8 * math.sin(a)), pz + R * 0.95 * math.cos(a))
            d = (-1.0, 0.25 * math.sin(a), 0.35 * math.cos(a))
            prism(glow, base, d, 0.04 + 0.03 * rng.random(), 0.25 + 0.3 * rng.random(), "violet" if k % 3 == 0 else "cyan", sides=5)
    # crystals bursting out of the cliff's fractures, where a column split away
    for fx_, fz in fr:
        gy = G.y(min(fx_, half - 0.1), fz)
        y0 = gy + 0.4 + 0.6 * rng.random()
        ht = 1.3 + 1.3 * rng.random()
        for j, (at, big) in enumerate(((0.25, 1.0), (0.6, 0.65), (0.88, 0.45))):
            yy = y0 + ht * at
            colr = "cyan" if (j + int(abs(fz))) % 3 else "violet"
            for m in range(4 + int(3 * big)):
                d = (-(0.55 + 0.45 * rng.random()), 0.2 + 0.7 * rng.random(), (rng.random() - 0.5) * 0.9)
                prism(glow, (22.4, yy + (rng.random() - 0.5) * 0.12, fz + (rng.random() - 0.5) * 0.12), d, (0.035 + 0.04 * rng.random()) * (0.6 + 0.6 * big), (0.22 + 0.35 * rng.random()) * (0.6 + 0.7 * big), colr if m % 3 else colr + "Soft", sides=5)
        # (the fracture's dark depth behind its crystals)
        q = [roots.v(22.75, y0 - 0.3, fz - 0.28), roots.v(22.75, y0 - 0.3, fz + 0.28), roots.v(22.75, y0 + ht + 0.3, fz + 0.2), roots.v(22.75, y0 + ht + 0.3, fz - 0.2)]
        for v in q:
            roots.setv(v, "vug")
        f = roots.face(q, "vug")
        f.normal_update()
        if f.normal.x > 0:
            f.normal_flip()
    # the glowing fungi at the cliff's foot: the only life in the chasm's dark
    for k in range(10):
        z = -20.5 + 21.5 * k / 9 + (rng.random() - 0.5) * 0.8
        x = 21.35 + 0.3 * rng.random()
        if any(math.hypot(x - px, z - pz) < pr + 0.6 for px, pz, pr in east):
            continue
        fungi(rock, glow, x, G.y(x, z), z, 0.9 + 0.4 * rng.random(), rng)


# ---------------------------------------------------------------------------------------------
# the rock: the doline's mounds and boulders, the outcrops down the slopes, stalagmites, the talus's
# piles, the host rock round the nodes that stand free, the chasm's floor crystals and fungi


def stalagmite(M, x, y, z, r, h, rng):
    """A fluted stalagmite: a tapering column of flowstone, ringed where it grew in pulses."""
    segs = 7
    rings = 6
    prof = []
    for j in range(rings + 1):
        t = j / rings
        prof.append((r * (1 - t) ** 1.25 * (1 + 0.08 * math.sin(t * 17)), h * t))
    bottom = M.v(x, y - 0.2, z)
    vs = []
    for j, (rr, hh) in enumerate(prof[:-1]):
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            fl = 1 + 0.1 * math.cos(a * 3 + j)
            v = M.v(x + math.cos(a) * rr * fl, y + hh - (0.2 if j == 0 else 0.0), z + math.sin(a) * rr * fl)
            M.setv(v, mixc("limestoneDark", "flowstone", j / rings))
            ring.append(v)
        vs.append(ring)
    tip = M.v(x, y + h, z)
    M.setv(tip, "flowstone")
    for r0, r1 in zip(vs, vs[1:]):
        for k in range(segs):
            k1 = (k + 1) % segs
            M.setsmooth(M.face((r0[k], r0[k1], r1[k1], r1[k]), "flowstone"))
    for k in range(segs):
        M.setsmooth(M.face((vs[-1][k], vs[-1][(k + 1) % segs], tip), "flowstone"))


def build_rocks(G, L, rock, roots, glow, rng):
    half = L["half"]
    doline = lambda x, z: z < -9.5
    for x, z, r, h in L["mounds"]:
        # terraced karst mounds, moss on their shoulders
        y = G.y(x, z)
        for k in range(3):
            rr = r * (1 - 0.26 * k)
            lump(rock, x + 0.1 * k * math.sin(x), y + h * 0.3 * k, z + 0.1 * k * math.cos(z), rr * 1.05, h * 0.42, rr * 0.95, rng, rock_colour(moss=0.9), rough=0.22, sink=0.35)
    for x, z, r in L["boulders"]:
        lump(rock, x, G.y(x, z), z, r, r * 1.1, r * 0.9, rng, rock_colour(moss=0.8 if doline(x, z) else 0.0), rough=0.26)
    for x, z, r, h in L["outcrops"]:
        lump(rock, x, G.y(x, z), z, r, h, r * 0.85, rng, rock_colour(moss=0.5 if doline(x, z) else 0.0), rough=0.3, sink=0.2)
        ox, oz = x + r * 0.7, z - r * 0.35
        lump(rock, ox, G.y(ox, oz), oz, r * 0.55, h * 0.55, r * 0.5, rng, rock_colour(), rough=0.3)
    for x, z, r, h in L["stalagmites"]:
        stalagmite(rock, x, G.y(x, z), z, r, h, rng)
        lump(rock, x, G.y(x, z), z, r * 1.5, 0.35, r * 1.4, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.2, sink=0.4)
    # the host rock behind every node that stands free: limestone in the north, basalt stubs in the
    # chasm, so each node sits nested in its own pocket of rock
    for nd in L["nodes"]:
        if nd["kind"] == "monolith" or nd["z"] < -21.0 or nd["x"] < -21.0 or nd["x"] > 20.3:
            continue
        r = ORE_RADII.get(nd["kind"], 0.5)
        fx, fz = nd["face"]
        fl = math.hypot(fx, fz) or 1.0
        bx, bz = nd["x"] - fx / fl * (r + 0.45), nd["z"] - fz / fl * (r + 0.45)
        if nd["x"] > 13.0:
            for k in range(5):
                a = math.atan2(-fz, -fx) + (k - 2) * 0.55
                px, pz = nd["x"] + math.cos(a) * (r + 0.4), nd["z"] + math.sin(a) * (r + 0.4)
                hex_column(roots, px, G.y(px, pz) - 0.3, pz, 0.28, (1.1 + 0.5 * rng.random()) * (1.2 - 0.25 * abs(k - 2)), rng)
        else:
            lump(rock, bx, G.y(bx, bz), bz, r + 0.35, r * 1.6, r + 0.25, rng, rock_colour(moss=0.6 if doline(bx, bz) else 0.0), rough=0.25)
    # the talus: a few piles of fallen blocks where the slope let them fall (never a line of stones)
    trng = random.Random(41)
    centres = []
    for k in range(900):
        if len(centres) >= 8:
            break
        x = -19.0 + 38.0 * trng.random()
        z = -19.0 + 26.0 * trng.random()
        if G.walk(x, z) or not (0.5 < G.y(x, z) < 3.3) or any(math.hypot(x - a, z - b) < 5.0 for a, b in centres):
            continue
        if any(math.hypot(x - nd["x"], z - nd["z"]) < 1.8 for nd in L["nodes"]) or x < -12.5:
            continue
        e = 0.3
        steep = math.hypot(G.y(x + e, z) - G.y(x - e, z), G.y(x, z + e) - G.y(x, z - e)) / (2 * e)
        if steep < 0.3:
            continue
        centres.append((x, z))
    placed = 0
    for cx_, cz_ in centres:
        for j in range(6):
            a = trng.random() * 6.283
            d = 0.0 if j == 0 else 0.4 + 1.0 * trng.random()
            x, z = cx_ + math.cos(a) * d, cz_ + math.sin(a) * d
            if G.walk(x, z):
                continue
            r = (0.5 if j == 0 else 0.15 + 0.22 * trng.random() ** 1.4)
            angular(rock, x, G.y(x, z), z, r, r * (0.8 + 0.4 * trng.random()), trng, "limeCool" if trng.random() < 0.5 else "limestone", "limestoneDark", sink=0.15, npts=10)
            placed += 1
    GEO_STATS["talus"] = placed
    # the chasm floor's crystal clusters and fungi (the east's midnight: nothing green there)
    for x, z, s in L["crystals"]:
        crystal_cluster(glow, rock, x, G.y(x, z), z, s, rng)
    for x, z, s in L["shrooms"]:
        fungi(rock, glow, x, G.y(x, z), z, s, rng)
    # the doline's green ferns, in the lee of its mounds and boulders (only there: the sun reaches it)
    nodes = [(nd["x"], nd["z"]) for nd in L["nodes"]]
    for k in range(30):
        x = -12.0 + rng.random() * 24.0
        z = -21.0 + rng.random() * 9.5
        if not G.walk(x, z) or any(math.hypot(x - a, z - b) < 0.9 for a, b in nodes):
            continue
        fern(rock, x, G.y(x, z), z, 0.25 + 0.2 * rng.random(), rng)
    # the cairns at the trails' junctions
    crng = random.Random(29)
    for x, z, s in L["cairns"]:
        cairn(rock, G, x, z, s, crng)


# ---------------------------------------------------------------------------------------------
# the Expedition Basecamp


def build_camp(G, L, rock, glow):
    Wk = L["workstation"]
    wy = G.y(Wk["x"], Wk["z"])
    Cp = L["camp"]
    # Gus's log workstation (the counter he trades over): a log on two stumps, a plank top, his finds
    for sx in (-1, 1):
        cyl(rock, (Wk["x"] + sx * Wk["len"] * 0.36, wy - 0.05, Wk["z"]), (Wk["x"] + sx * Wk["len"] * 0.36, wy + Wk["top"] - 0.16, Wk["z"]), 0.22, "timberDark", sides=9)
    cyl(rock, (Wk["x"] - Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), (Wk["x"] + Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), Wk["w"] * 0.5, "timber", sides=9)
    box(rock, Wk["x"] - Wk["len"] / 2 + 0.05, Wk["x"] + Wk["len"] / 2 - 0.05, wy + Wk["top"] - 0.12, wy + Wk["top"], Wk["z"] - Wk["w"] * 0.42, Wk["z"] + Wk["w"] * 0.42, "plank", bottom=False)
    for k, colr in enumerate(("copperNug", "silverVein", "coalChunk", "copperNug")):
        blob(rock, Wk["x"] - 0.42 + k * 0.1, wy + Wk["top"] + 0.05, Wk["z"] - 0.02, 0.04, 0.035, 0.04, colr, cuts=0)
    box(rock, Wk["x"] + 0.3, Wk["x"] + 0.62, wy + Wk["top"], wy + Wk["top"] + 0.03, Wk["z"] - 0.12, Wk["z"] + 0.12, "leather")
    # the tarp shelter: four weathered posts, a ridge beam and eaves, the canvas over them
    posts = Cp["posts"]
    ridge, eave = Cp["ridge"], Cp["eave"]
    tops = []
    for k, (px, pz) in enumerate(posts):
        py = G.y(px, pz)
        ht = ridge if k < 2 else eave
        cyl(rock, (px, py - 0.1, pz), (px, py + ht, pz), 0.07, "timber" if k % 2 else "timberDark", sides=6)
        tops.append((px, py + ht, pz))
    cyl(rock, tops[0], tops[1], 0.06, "timberDark", sides=6)
    cyl(rock, tops[2], tops[3], 0.05, "timber", sides=6)
    for a, b in ((0, 2), (1, 3)):
        cyl(rock, tops[a], tops[b], 0.045, "timber", sides=5)
    tarp(rock, [(tops[0][0] - 0.25, tops[0][1] + 0.08, tops[0][2] + 0.2), (tops[1][0] + 0.25, tops[1][1] + 0.08, tops[1][2] + 0.2), (tops[3][0] + 0.25, tops[3][1] + 0.05, tops[3][2] - 0.25), (tops[2][0] - 0.25, tops[2][1] + 0.05, tops[2][2] - 0.25)], 0.16, "canvas", "canvasShade")
    for t in (0.22, 0.78):
        x = tops[0][0] + (tops[1][0] - tops[0][0]) * t
        lantern(rock, glow, x, tops[0][1] - 0.06, tops[0][2], hang=0.28)
    # the crate stack, iron-strapped, its specimen jars glowing with their finds
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


# ---------------------------------------------------------------------------------------------
# the Basalt Crucible Forge and its flagstone workshop: carried over exactly as they were built


def build_forge_alcove(G, L, rock, glow, water, rng):
    half = L["half"]
    F = L["forge"]
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


# ---------------------------------------------------------------------------------------------
# the Travertine Thermal Terraces: the west buttress, the three pools' rimstone dams growing out of
# it, their warm water and its cascades, the submerged seats


def build_grotto(G, L, rock, therm, shell, ledge_top, rng):
    half = L["half"]
    T = L["terraces"]
    # the buttress's two arms round the grotto, limestone draped in flowstone at their feet
    for rg in L["ridges"]:
        for x, z, r, h in rg["points"]:
            lump(rock, x, G.y(x, z), z, r * 1.1, h, r, rng, rock_colour(base="limestone", dark="limestoneDark"), rough=0.28, sink=0.3)
            lump(rock, x + 0.3, G.y(x, z), z, r * 1.25, 0.55, r * 1.1, rng, rock_colour(base="flowstone", dark="travertineShadow"), rough=0.2, sink=0.4)
    pools = G.pools
    for pi, P in enumerate(pools):
        (cx, cz, rx, rz), outline = pool_outline(G, pi, pi * 1.7 + 0.3)
        wy_ = P["y"]
        nO = len(outline)
        # the dam: an organic lip round the pool (its outline sampled three times finer and broken by
        # noise, so no two stretches match), its crest crenulated where it spilled, thicker on the
        # downhill side (east and south), rising into the buttress on the west, its outer face
        # stepped in little gours; banded cream and grey, wet and darker inside
        fine = []
        for k in range(nO):
            (ax_, az_), (bx_, bz_) = outline[k], outline[(k + 1) % nO]
            for t in (0.0, 1 / 3, 2 / 3):
                fine.append((ax_ + (bx_ - ax_) * t, az_ + (bz_ - az_) * t))
        nF = len(fine)
        steps = ((0.93, -0.32, "travertineShadow"), (0.985, 0.03, "rimstone"), (1.04, 0.08, "rimstone"), (1.09, 0.05, "travertine"), (1.13, -0.03, "flowstone"), (1.19, -0.06, "travertine"), (1.25, -0.14, "travertineShadow"), (1.34, None, "strata"))
        rings = []
        for si, (scale, lift, colr) in enumerate(steps):
            ring = []
            for k, (px, pz) in enumerate(fine):
                ang = math.atan2(pz - cz, px - cx)
                downhill = 0.5 + 0.5 * max(math.cos(ang), math.sin(ang))
                jag = 1 + 0.035 * fbm(math.cos(ang) * 2.2 + si * 0.7, math.sin(ang) * 2.2, pi * 3.1, 89) * (si > 0)
                sc = 1 + (scale - 1) * (0.7 + 0.6 * downhill) * jag
                qx, qz = cx + (px - cx) * sc, cz + (pz - cz) * sc
                gy = G.y(qx, qz)
                west = smooth(cx - rx * 0.2, cx - rx * 0.95, qx)
                cren = 0.03 * math.sin(k * 1.9 + pi) * (0.5 + 0.5 * math.sin(k * 0.37)) + 0.025 * fbm(qx * 3.0, si, qz * 3.0, 83 + pi)
                if lift is None:
                    y = gy - 0.05
                else:
                    y = max(gy - 0.03, wy_ + lift + cren + 0.4 * west * (scale > 1.0))
                v = rock.v(qx, y, qz)
                band = 0.5 + 0.5 * math.sin(y * 18.0 + fbm(qx, y, qz, 91) * 3.0)
                c = mixc(colr, "travertine" if colr != "travertine" else "rimstone", band * 0.35)
                c = mixc(c, "flowstoneWarm", west * 0.45)
                if si == 0:
                    c = mixc(c, "algae", 0.35)
                rock.setv(v, c)
                ring.append(v)
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(nF):
                k1 = (k + 1) % nF
                f = rock.face((r0[k], r0[k1], r1[k1], r1[k]), "rimstone")
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
                rock.setsmooth(f)
        # the warm water
        wv = [therm.v(cx + (qx - cx) * 0.97, wy_, cz + (qz - cz) * 0.97) for qx, qz in outline]
        mid = therm.v(cx, wy_, cz)
        for k in range(nO):
            f = therm.face((mid, wv[(k + 1) % nO], wv[k]), "thermalWater")
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        # its cascade over the dam into the pool below (or down to the floor from the last)
        if pi + 1 < len(pools):
            ny_ = pools[pi + 1]["y"]
            for k in range(2):
                ccx = cx - 0.6 + 1.4 * k
                q = [therm.v(ccx - 0.3, wy_ + 0.03, cz + rz - 0.02), therm.v(ccx + 0.3, wy_ + 0.03, cz + rz - 0.02), therm.v(ccx + 0.36, ny_ - 0.02, cz + rz + 0.4), therm.v(ccx - 0.36, ny_ - 0.02, cz + rz + 0.4)]
                therm.face(q, "thermalWater")
                blob(rock, ccx, ny_ + 0.02, cz + rz + 0.48, 0.3, 0.03, 0.14, "foam", cuts=1)
        # the submerged stone seats, chest-deep
        for st in L["thermalSeats"]:
            if P["z0"] <= st["z"] <= P["z1"]:
                blob(rock, st["x"], wy_ + ledge_top - 0.12, st["z"], 0.36, 0.14, 0.32, "travertine", cuts=1, noise=0.15, seed=int(st["z"] * 10), bottom=wy_ - 0.4, top=wy_ + ledge_top)
    # the spring spilling out of the buttress into the top pool
    sp_z = (T["pools"][0]["z0"] + T["pools"][0]["z1"]) / 2
    for k in range(5):
        blob(rock, -half + 0.95, pools[0]["y"] + 0.25 + k * 0.34, sp_z + 0.2 * math.sin(k), 0.2, 0.26, 0.3, "flowstoneWarm", cuts=1)
    q = [therm.v(-half + 1.1, pools[0]["y"] + 1.8, sp_z - 0.25), therm.v(-half + 1.1, pools[0]["y"] + 1.8, sp_z + 0.25), therm.v(-half + 1.2, pools[0]["y"] + 0.01, sp_z + 0.35), therm.v(-half + 1.2, pools[0]["y"] + 0.01, sp_z - 0.35)]
    therm.face(q, "thermalWater")


# ---------------------------------------------------------------------------------------------
# the cenote: the islet's crag and its banyan, reeds, the wreck on the south-west shore, the mine
# cart at the east cliff's foot


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


def build_cenote(G, L, rock, roots, glow, rng):
    half = L["half"]
    I = L["islet"]
    Tw = L["tower"]
    tx, tz = Tw["x"], Tw["z"]
    ty = G.y(tx, tz)
    Mo = next(nd for nd in L["nodes"] if nd["kind"] == "monolith")
    # the islet's crag: stacked, weathered blocks of dark limestone
    for k, (dx, dz, r, h, y0) in enumerate(((-0.55, 0.35, 1.45, 1.6, -0.5), (-0.25, 0.1, 1.15, 1.5, 0.8), (0.25, -0.2, 1.3, 1.0, 2.0), (-0.35, 0.25, 0.85, 1.1, 2.7), (-0.5, 0.45, 0.5, 1.0, 3.6), (-1.3, 0.9, 0.8, 1.2, -0.4))):
        lump(rock, tx + dx, ty + y0, tz + dz, r, h * 1.1, r * 0.85, rng, rock_colour(moss=0.4), rough=0.42, sink=0.15)
    for k in range(8):
        a = rng.random() * 6.28
        rr = I["r"] * (0.35 + 0.35 * rng.random())
        px, pz = I["x"] + math.cos(a) * rr, I["z"] + math.sin(a) * rr
        if math.hypot(px - Mo["x"], pz - Mo["z"]) < 1.5:
            continue
        fern(rock, px, G.y(px, pz), pz, 0.3 + 0.2 * rng.random(), rng)
    # the ancient banyan's roots, strangling the crag and diving into the deep on its far side
    inward = math.atan2(I["z"] - tz, I["x"] - tx)
    rrng = random.Random(77)
    made = 0
    for k in range(140):
        if made >= 18:
            break
        a0 = rrng.random() * 6.283
        spin = (0.5 + 0.8 * rrng.random()) * (1 if rrng.random() < 0.5 else -1)
        end = a0 + spin
        if abs(math.atan2(math.sin(end - inward), math.cos(end - inward))) < 1.35:
            continue
        y0 = ty + 2.6 + 1.6 * rrng.random()
        flare = 1.2 + 1.6 * rrng.random()
        pts = []
        for j in range(10):
            t = j / 9
            ang = a0 + spin * t
            y = y0 + (-0.9 - y0) * t
            hug = 0.95 + 0.35 * smooth(ty + 2.2, ty + 3.2, y) + 0.12 * math.sin(t * 9 + k)
            rr = hug + flare * smooth(0.55, 1.0, t) ** 1.4
            x = tx - 0.45 + math.cos(ang) * rr
            z = tz + 0.35 + math.sin(ang) * rr
            y = max(y, min(G.y(x, z), L["lake"]["water"]) - 0.9) if t < 0.95 else min(y, L["lake"]["water"] - 0.8)
            pts.append((x, y, z))
        base = 0.11 + 0.07 * rrng.random()
        tube(roots, pts, [base * (1 - 0.55 * j / 9) + 0.02 for j in range(10)], "banyan", sides=6, colours=[mixc("banyan", "banyanDark", j / 9) for j in range(10)], cap_start=True)
        made += 1
    GEO_STATS["banyanRoots"] = made
    # cave reeds: pale, in clumps along the shore by the wreck and here and there round the water
    B = L["beach"]
    reeds = [(B["dinghy"][0] - 1.4, B["dinghy"][1] - 0.9), (B["dinghy"][0] + 1.1, B["dinghy"][1] + 0.4), (B["dinghy"][0] - 0.4, B["dinghy"][1] + 1.6)]
    for k in range(40):
        a = rng.random() * 6.283
        x = L["lake"]["x"] + math.cos(a) * L["lake"]["rx"] * 1.04
        z = L["lake"]["z"] + math.sin(a) * L["lake"]["rz"] * 1.04
        if len(reeds) >= 11:
            break
        if G.walk(x, z) and abs(lake_factor(L, x, z) - 1.06) < 0.05 and not any(math.hypot(x - a_, z - b_) < 3.0 for a_, b_ in reeds) and math.hypot(x - L["finnegan"]["x"], z - L["finnegan"]["z"]) > 2.5:
            reeds.append((x, z))
    for x, z in reeds:
        y = G.y(x, z)
        for j in range(7):
            rx_, rz_ = x + (rng.random() - 0.5) * 0.6, z + (rng.random() - 0.5) * 0.6
            cyl(rock, (rx_, y - 0.1, rz_), (rx_ + (rng.random() - 0.5) * 0.18, y + 0.45 + 0.5 * rng.random(), rz_ + (rng.random() - 0.5) * 0.18), 0.012, "reedPale" if j % 2 else "reedPaleDark", sides=3, r_end=0.004, cap=False)
    # the wreck: a waterlogged dinghy half-buried in the wet sediment, driftwood tangled round it
    dx_, dz_, dyaw = B["dinghy"]
    dinghy(rock, G, dx_, dz_, dyaw)
    for x, z, yaw, ln in B["logs"]:
        ax_, az_ = x - math.cos(yaw) * ln / 2, z + math.sin(yaw) * ln / 2
        bx_, bz_ = x + math.cos(yaw) * ln / 2, z - math.sin(yaw) * ln / 2
        cyl(rock, (ax_, G.y(ax_, az_) + 0.09, az_), (bx_, G.y(bx_, bz_) + 0.12, bz_), 0.15, "driftwood", sides=8)
        for ex, ez in ((ax_, az_), (bx_, bz_)):
            lathe(rock, ex, ez, [(0, 0), (0.13, 0), (0, 0.001)], "driftwoodDark", segs=8, y0=G.y(ex, ez) + 0.02)
        cyl(rock, (x + 0.1, G.y(x, z) + 0.2, z), (x + 0.32, G.y(x, z) + 0.46, z + 0.24), 0.04, "driftwoodDark", sides=5, r_end=0.018)
    # the mine cart: overturned against the foot of the east cliff, its ore spilled, its rails
    # buckled, two lengths of rail leaning on the basalt
    cx_, cz_, cyaw = L["survey"]["cart"]
    minecart(rock, glow, G, cx_, cz_, cyaw, rng)
    for k, dz in enumerate((-1.3, 1.25)):
        a = (cx_ + 0.1, G.y(cx_ + 0.1, cz_ + dz) + 0.02, cz_ + dz)
        b = (22.15, G.y(21.8, cz_ + dz) + 1.0 + 0.2 * k, cz_ + dz + 0.25)
        cyl(rock, a, b, 0.024, "rustDark", sides=4)


# ---------------------------------------------------------------------------------------------
# the world


def build_world(G, L, coll, ledge_top):
    global WATER
    half = L["half"]
    ground = Mesh("CV_Clay")
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    water = Mesh("CV_Water")
    therm = Mesh("CV_ThermalWater")
    WATER = water
    rng = random.Random(11)
    lt = L["lights"]
    Cp = L["camp"]

    # --- the light painted in: the lamps and the fires ---
    add_light(*lt["forge"], "#FF8A3A", 1.4, 6.0)
    add_light(L["forge"]["x"], G.y(L["forge"]["x"], L["forge"]["z"] + 1.2) + 1.1, L["forge"]["z"] + 0.1, "#FF5A1F", 1.2, 3.2)
    add_light(L["forge"]["x"], G.y(L["forge"]["x"], L["forge"]["z"] + 1.2) + 0.5, L["forge"]["z"] + 1.0, "#FF7A2F", 1.0, 2.6)
    add_light(*lt["thermal"], "#FFE9C4", 1.1, 7.0)
    add_light(*lt["cenote"], "#35E6FF", 0.9, 8.0)
    add_light((Cp["posts"][0][0] + Cp["posts"][1][0]) / 2, G.y(-6.2, -15.6) + 2.2, Cp["posts"][0][1], "#FFB347", 1.4, 5.0)
    add_light(L["adit"]["x"] + 0.7, G.y(L["adit"]["x"], -half + 1.5) + 2.0, L["adit"]["z"] + 0.9, "#FFB347", 1.2, 4.5)
    add_light(L["finnegan"]["x"] + 0.7, G.y(L["finnegan"]["x"], L["finnegan"]["z"]) + 0.5, L["finnegan"]["z"] + 0.3, "#FFB347", 1.0, 4.0)
    for x, z, s in L["crystals"]:
        add_light(x, G.y(x, z) + 0.5 * s, z, "#00F5D4", 0.3 * s, 1.1 * s)

    build_floor(G, L, ground, shell)
    build_walls(G, L, shell, rock, glow, rng)
    build_east_cliff(G, L, roots, glow, rock, random.Random(23))
    build_rocks(G, L, rock, roots, glow, rng)
    build_camp(G, L, rock, glow)
    build_forge_alcove(G, L, rock, glow, water, random.Random(31))
    build_grotto(G, L, rock, therm, shell, ledge_top, random.Random(37))
    build_cenote(G, L, rock, roots, glow, random.Random(43))

    # --- the fauna's templates (instanced by the game): the glowing cave crab, the swiftlet ---
    crab = Mesh("CV_Glow")
    blob(crab, 0.0, 0.035, 0.0, 0.07, 0.028, 0.055, "crabShell", cuts=1)
    blob(crab, 0.0, 0.058, 0.0, 0.045, 0.012, 0.035, "crabGlow", cuts=1)
    for sx in (-1, 1):
        blob(crab, sx * 0.07, 0.04, 0.055, 0.028, 0.018, 0.022, "crabGlow", cuts=0)
        for k in range(3):
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
    swift.face([swift.v(0.0, 0.0, -0.08), swift.v(0.05, 0.0, -0.16), swift.v(0.0, 0.0, -0.12), swift.v(-0.05, 0.0, -0.16)], "swift")

    for f in glow.bm.faces:
        glow.setsmooth(f)
    finish_object("Fauna_Crab", crab, coll, bake=False)
    finish_object("Fauna_Swift", swift, coll, bake=False)
    finish_object("caverns_walk_collider", ground, coll, mottle=0.04)
    finish_object("Cave_Rock", rock, coll, mottle=0.06)
    finish_object("Cave_Shell", shell, coll, mottle=0.06)
    finish_object("Cave_Roots", roots, coll, mottle=0.06)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)


# ---------------------------------------------------------------------------------------------
# the export: packed; the ore nodes' templates


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


def build(root):
    purge()
    LIGHTS.clear()
    L = read_layout(root)
    LAYOUT.clear()
    LAYOUT.update(L)
    ORE_RADII.clear()
    ORE_RADII.update(read_ore_radii(root))
    G = Ground(read_terrain(root))
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
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
    static = {k: v for k, v in out.items() if not k.startswith(("Ore_", "Fauna_"))}
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
        # (the templates sit at the origin: not in the studio's grid)
        for o in list(coll.all_objects):
            if o.name.startswith(("Ore_", "Fauna_")):
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
