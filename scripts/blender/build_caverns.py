"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb. This is the BLOCKOUT
(phase 1 of docs/caverns-design.md): every zone's ground in its own flat colour, its cliffs darker, the
trails worn pale, the water, the pools and the stream as plain surfaces; the Basalt Crucible Forge's
alcove, Gus's camp and the adit as they were; with phase 2's structure: the walls' bedding, the
jungle's broken rim and the Great Wall's flowstone, every cliff dressed as rock, the terraces'
rimstone lips, the trails' edges and the map's rim. The zones' own rock, plants and light come in the
later phases, one zone at a time.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    npm run caverns-terrain
    blender -b --factory-startup -P scripts/blender/build_caverns.py

(CAVERNS_NO_STUDIO=1 for a trial that neither opens nor saves the studio's master file, CAVERNS_OUT
for somewhere else to write the .glb.) It only ever touches its own "Caverns" collection
(`clean_caverns_collection`: that collection's objects and the meshes they alone used, at the
studio's X = 212; no select_all, nothing of the Velvet Ring's, the Forest's or any other world's);
the export takes only this collection's objects.

Nothing is placed by hand. Where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is), and the ground itself
from the very grid the game walks: scripts/blender/data/caverns_terrain.json (`npm run
caverns-terrain` writes it from caverns.ts; `npm run check-layout` fails while it is stale), each
vertex with its zone's surface (caverns.ts SURFACE).

The world, one function each:

    build_terrain            the floor: a subdivided grid displaced to the walk grid, which is the
                             game's click collider too (caverns_walk_collider), each zone's ground its
                             own colour, the cliffs between levels darker, the trails pale; its edge
                             carried down to -2.5 m all round (the pedestal's skirt)
    build_walls / build_adit the north and west limestone cliffs, leaning back (nothing overhangs),
                             stepped by their bedding, broken off in blocks over the jungle (the
                             collapse), the Great Wall's flowstone curtains behind the terraces, rust
                             bleeding down over the mudflats, fractured over the breakdown; hollowed
                             round the nodes set in them; the adit's bore and timbers
    build_cliff_faces        every cliff between two levels dressed as rock over its slope (traced
                             from the layout's own rims): strata, rust-stained bluffs, the terraces'
                             rimstone gours, the crystal wall's dark basalt over the rift
    build_terrace_lips       a rimstone lip round every warm pool
    build_trail_edges        the rope descent's stakes and rope, stones lining the trails across the
                             cliffs, a cairn at each trail's end
    build_rim                low broken rock along the open south and east edges, the lake's outflow
                             falling over the rim
    build_camp               Gus's Expedition Basecamp
    build_forge_alcove       the Basalt Crucible Forge, the flagstones, the Geode Anvil, the chisel
                             rack and the tool crate (carried over exactly as they were built)
    build_waters             the Great Lake's surface, the terraces' three warm pools (their seats
                             under the water), the stream's ribbon (its falls where it crosses a cliff),
                             the jungle's plunge pool and the waterfall into it
    build_blockout_rocks     the boulders, the host rock behind every node that stands free, the
                             rift's crystals and fungi, each in its zone's colour
    build_hounds_hand        the giant stalagmite on the overlook (dithered in front of the camera)
    build_winch              Gus's winch lift at the breakdown's edge, its rope down to the rift
    build_causeway           the stepping stones out to the Monolith's islet

One mesh per finish:

    caverns_walk_collider  CV_Clay          the floor and its skirt
    Cave_Rock              CV_Clay          every rock, the camp, the forge, the adit, the winch, the
                                            causeway's stones
    Cave_Shell             CV_Shell         the north and west walls; double sided
    Cave_Roots             CV_Occluder      the Hound's Hand (dithered in front of the camera)
    Cave_Glow              CV_Glow          crystals, fungi, lanterns, the forge's fire and runes
    Cave_Water             CV_Water         the lake, the stream, the plunge pool, the falls, the
                                            quench trough
    Cave_Thermal           CV_ThermalWater  the pools' warm water

and the templates the game instances: the ore nodes' rocks (Ore_<kind>, Ore_<kind>_Glow, Ore_Rubble),
the glowing cave crab and the swiftlet (Fauna_Crab, Fauna_Swift). The export is packed
(`quantize_glb`, KHR_mesh_quantization).

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
SKIRT_Y = -2.5
ORE_RADII = {}
GEO_STATS = {}

C = {
    # the floor: grey limestone, the cenote's dark sediment, the lake's bed
    "floor": "#3A3D44",
    "floorLight": "#42454C",
    "floorDark": "#33363C",
    "floorSeam": "#2A2C31",
    "trodden": "#303238",
    "sediment": "#4A4439",
    "sedimentDry": "#544D40",
    "sedimentWet": "#34302A",
    "bedShallow": "#3F6E68",
    "bedMid": "#285A58",
    "skirt": "#26282D",
    "skirtDark": "#16171B",
    # the walls' limestone
    "limestone": "#6A6C71",
    "limestoneLight": "#7E8084",
    "limestoneDark": "#4D4F55",
    "limeCool": "#77787A",
    "wallFoot": "#2C2E33",
    "vault": "#2A2C31",
    "vug": "#121015",
    "strata": "#57534C",
    "strataDark": "#48443E",
    "flowstone": "#8A857B",
    # the east cliff's basalt
    "basaltCol": "#34343C",
    "basaltColLight": "#40404A",
    "basaltTop": "#5E5C66",
    # the grotto: wet grey stone, a mineral-grey lip (never white)
    "rimWet": "#44474D",
    "rimLip": "#6C6A64",
    "rimStone": "#56585E",
    "thermalWater": "#8FE3D8",
    # water
    "aqua": "#38C2C4",
    "aquaShallow": "#8FE0D4",
    "waterDark": "#27424A",
    # crystals, fungi, what glows
    "cyan": "#00F5D4",
    "violet": "#7B2CBF",
    "cyanSoft": "#6FFFE6",
    "violetSoft": "#A66BE0",
    "fungusTeal": "#4FFFD2",
    "fungusViolet": "#B98CFF",
    "shroomStem": "#CFC8BC",
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
    "moss": "#4A6B35",
    "mossDeep": "#34502A",
    "fern": "#4F8A3A",
    "fernLight": "#7DB352",
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
    "canvas": "#C8B894",
    "canvasShade": "#A8977A",
    "brass": "#C9A24A",
    "brassDark": "#8C6B2A",
    "glass": "#CFE3E0",
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
    "coalChunk": "#16151A",
    "coalRock": "#3B3632",
    "copperRock": "#6B4A3A",
    "copperNug": "#D9803F",
    "copperGlow": "#FFB070",
    "ironRock": "#55585F",
    "rust": "#8A4B2A",
    "ironGlow": "#FF8A4A",
    "silverRock": "#7D8594",
    "silverVein": "#DFF6FF",
    "glimmerBase": "#2A2D3A",
    "slate": "#33363D",
    "slateWet": "#2C3340",
    "monolith": "#2B2433",
    "monolithEdge": "#3C3348",
    "rubble": "#2F2B30",
    "rubbleCrack": "#1A181C",
    # the blockout's grounds, one per zone (shared/worlds/caverns.ts SURFACE)
    "groundCamp": "#8A7456",
    "groundJungle": "#4E7A3A",
    "groundBreakdown": "#7C7F86",
    "groundMud": "#9A5A36",
    "groundOverlook": "#A8A396",
    "groundTravertine": "#D8D2C0",
    "groundRift": "#2B2838",
    "groundShore": "#5E5446",
    "groundTrail": "#C9AE7C",
    "groundStream": "#3A4A52",
    "groundPool": "#6FA89E",
    "bedDeep": "#0B2A34",
    "foam": "#E6FAF6",
    "cliffRock": "#3E3B42",
    "mudRock": "#A8653C",
    "mudRockDark": "#6E3F26",
    "travRock": "#E6E0CE",
    "travRockDark": "#B8AF98",
}


# ---------------------------------------------------------------------------------------------
# colours, coordinates, the files read


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
    """The game's (x, y up, z) as a Blender point (linear: a direction converts the same way)."""
    return Vector((x, -z, y))


def game_point(v):
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


def frange(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * k / n for k in range(n + 1)]


# ---------------------------------------------------------------------------------------------
# the mesh and its primitives


class Mesh:
    """Faces with a colour each (a palette index in the face layer "ci"); a vertex may carry its own
    colour (the vert layer "vc", index + 1: shared by every smooth face round it) and a face be
    smooth shaded ("sm"). (BMesh layers, not dicts: an element's Python wrapper is no key.)"""

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

    def facing(self, verts, col, out, smooth_=False):
        """A face turned to look along the game direction `out`."""
        f = self.face(verts, col)
        f.normal_update()
        if f.normal.dot(W(*out)) < 0:
            f.normal_flip()
        if smooth_:
            self.setsmooth(f)
        return f


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


def blob(M, cx, cy, cz, hx, hy, hz, col, cuts=3, n=2.2, noise=0.0, seed=0, bottom=None, top=None):
    """A rounded lump (a superellipsoid, roughened by `noise`), centred on the game point."""
    bm = M.bm
    # (the verts already there tagged: the new cube's are the untagged ones)
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
    for v in new:
        M.setv(v, col)
    for f in {f for v in new for f in v.link_faces}:
        M.setf(f, col)
        M.setsmooth(f)
    for v in bm.verts:
        v.tag = False


def prism(M, base, direction, r, length, col, sides=6, tip=0.35):
    """A crystal: a prism from `base` along `direction`, pointed at its end."""
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


def angular(M, x, y, z, r, h, rng, top, side, sink=0.2, squash=0.85, npts=12):
    """A fractured block: an angular hull, flat faceted faces, `top` where it faces up."""
    for f in chunk(M, r, h, rng, sink=sink, squash=squash, at=(x, y, z), npts=npts):
        f.normal_update()
        M.setf(f, top if f.normal.z > 0.45 else side)


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
    """A column of basalt: a hexagonal prism standing from `base`, its top a little tilted (the
    forge's)."""
    bx, by, bz = base
    ring0 = [M.v(bx + r * math.cos(2 * math.pi * k / 6), by, bz + r * math.sin(2 * math.pi * k / 6)) for k in range(6)]
    ring1 = [M.v(bx + r * math.cos(2 * math.pi * k / 6), by + h + 0.08 * math.sin(k), bz + r * math.sin(2 * math.pi * k / 6)) for k in range(6)]
    for k in range(6):
        k1 = (k + 1) % 6
        M.face((ring0[k1], ring0[k], ring1[k], ring1[k1]), col)
    M.face(list(ring1), col)


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
    for f in list({f for v in new for f in v.link_faces}):
        f.normal_update()
        c = game_point(f.calc_center_median())
        M.setf(f, colour(c[0], c[1], c[2], f.normal.z))
    for v in bm.verts:
        v.tag = False


def rock_colour(moss=0.0, base="limestone", dark="limestoneDark"):
    """A lump's paint: its beds, its dark foot, and a little moss on its top where the sun falls."""
    def paint(x, y, z, up):
        n1 = fbm(x * 0.9, y * 0.9, z * 0.9, 71)
        band = 0.5 + 0.5 * math.sin(y * 6.0 + n1 * 2.4)
        c = mixc(dark, base, 0.35 + 0.5 * band)
        c = mixc(c, "strata", max(0.0, fbm(x * 1.8, y * 1.8, z * 1.8, 73)) * 0.4)
        c = mixc(c, "wallFoot", smooth(0.1, -0.5, up) * 0.6)
        if moss > 0:
            m = smooth(0.45, 0.85, up) * smooth(0.0, 0.3, n1 + 0.3 * fbm(x * 3, y * 3, z * 3, 77))
            c = mixc(c, mixc("mossDeep", "moss", 0.5 + 0.5 * n1), m * moss)
        return c
    return paint


def stalagmite(M, x, y, z, r, h):
    """A fluted stalagmite: a tapering column of flowstone, ringed where it grew in pulses."""
    segs, rings = 7, 6
    prof = [(r * (1 - j / rings) ** 1.25 * (1 + 0.08 * math.sin(j / rings * 17)), h * j / rings) for j in range(rings + 1)]
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


def fern(M, x, y, z, s, rng):
    """A low-poly fern: a ring of arching fronds, each a bent strip seen from above."""
    n = 4 + int(rng.random() * 2)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.random() * 0.4
        ln = s * (0.8 + 0.4 * rng.random())
        ca, sa = math.cos(a), math.sin(a)
        pts = [(x + ca * ln * j / 2, y + 0.02 + ln * 0.55 * math.sin(j / 2 * math.pi * 0.85), z + sa * ln * j / 2) for j in range(3)]
        for j in range(2):
            (ax, ay, az), (bx, by, bz) = pts[j], pts[j + 1]
            w0 = s * 0.13 * (1 - j / 2.4)
            w1 = s * 0.13 * (1 - (j + 1) / 2.4)
            q = [M.v(ax - sa * w0, ay, az + ca * w0), M.v(bx - sa * w1, by, bz + ca * w1), M.v(bx + sa * w1, by, bz - ca * w1), M.v(ax + sa * w0, ay, az - ca * w0)]
            M.facing(q, "fernLight" if j == 1 else "fern", (0.0, 1.0, 0.0))


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
            M.facing((top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1]), col, (0.0, 1.0, 0.0))
            M.facing((bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k], bot[i][k]), under, (0.0, -1.0, 0.0))


def crystal_cluster(glow, rock, x, y, z, s, rng):
    """A cluster of crystals (amethyst and cyan) out of a dark socket of rock."""
    angular(rock, x, y, z, 0.3 * s, 0.22 * s, rng, "glimmerBase", "vug", sink=0.1, npts=9)
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.random() * 0.6
        lean = 0.2 + 0.45 * rng.random()
        colr = "violet" if (k + int(abs(x) * 3)) % 3 == 0 else "cyan"
        prism(glow, (x + math.cos(a) * 0.1 * s, y + 0.04, z + math.sin(a) * 0.1 * s), (math.cos(a) * lean, 1.0, math.sin(a) * lean), (0.045 + 0.04 * rng.random()) * s, (0.3 + 0.6 * rng.random()) * s, colr if k % 2 else colr + "Soft", sides=5)


def fungi(rock, glow, x, y, z, s, rng):
    """A patch of bioluminescent fungi: pale stems, glowing caps."""
    for k in range(4 + int(3 * rng.random())):
        a = rng.random() * 6.283
        d = 0.22 * s * rng.random()
        px, pz = x + math.cos(a) * d, z + math.sin(a) * d
        h = (0.06 + 0.12 * rng.random()) * s
        cyl(rock, (px, y - 0.02, pz), (px, y + h, pz), 0.012 * s, "shroomStem", sides=4, cap=False)
        blob(glow, px, y + h, pz, 0.045 * s, 0.018 * s, 0.045 * s, "fungusTeal" if k % 3 else "fungusViolet", cuts=0)


def reeds(rock, x, y, z, rng):
    """A clump of pale cave reeds."""
    for j in range(7):
        rx_, rz_ = x + (rng.random() - 0.5) * 0.6, z + (rng.random() - 0.5) * 0.6
        cyl(rock, (rx_, y - 0.1, rz_), (rx_ + (rng.random() - 0.5) * 0.18, y + 0.45 + 0.5 * rng.random(), rz_ + (rng.random() - 0.5) * 0.18), 0.012, "reedPale" if j % 2 else "reedPaleDark", sides=3, r_end=0.004, cap=False)


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
    """The model's own base light: even, a touch dimmer up the walls' heights."""
    fade = 1 - 0.18 * smooth(5.0, 10.0, p[1])
    return (0.94 * fade, 0.95 * fade, 0.98 * fade)


# ---------------------------------------------------------------------------------------------
# Blender: the studio, the collection, the finishes, the objects


def studio(root, call, *args):
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


def clean_caverns_collection():
    """Empties the "Caverns" collection (the studio keeps it under Studio_Caverns, its objects at
    X = 212) and hands it back to be filled again: every object in it removed, then the meshes only
    they used. Nothing is selected (no select_all) and no other collection is touched: the Velvet
    Ring, the Forest (Forest_Ground and the rest) and every other world keep all they have."""
    coll = bpy.data.collections.get(COLLECTION)
    scene = bpy.context.scene.collection
    if coll is None:
        coll = bpy.data.collections.new(COLLECTION)
    removed = 0
    meshes = []
    for o in list(coll.all_objects):
        if o.type == "MESH" and o.data is not None:
            meshes.append(o.data)
        bpy.data.objects.remove(o, do_unlink=True)
        removed += 1
    for me in meshes:
        if me.users == 0:
            bpy.data.meshes.remove(me)
    # (linked into the scene wherever it is: under Studio_Caverns in the master, at the root on a
    # fresh file)
    linked = coll.name in scene.children or any(coll.name in c.children for c in bpy.data.collections if c is not coll)
    if not linked:
        scene.children.link(coll)
    GEO_STATS["cleaned"] = removed
    return coll


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


def finish_object(name, M, coll, bake=True, mottle=0.0):
    """The mesh as an object: every face painted its colour (mottled a little, the light baked in)."""
    bm = M.bm
    col = bm.loops.layers.float_color.new("Col")
    bm.normal_update()
    for f in bm.faces:
        face_base = M.colors[f[M.fl]] if M.colors else (0.5, 0.5, 0.5)
        smooth_face = f[M.fs] == 1
        for loop in f.loops:
            v = loop.vert
            base = M.colors[v[M.vl] - 1] if smooth_face and v[M.vl] > 0 else face_base
            n = v.normal if smooth_face else f.normal
            p = game_point(v.co)
            c = base
            if mottle:
                k = 1 + mottle * fbm(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 5)
                c = (c[0] * k, c[1] * k, c[2] * k)
            if bake:
                c = lit(c, p, (n.x, n.z, -n.y), ambient_at(p))
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
# the ground as the game walks it


class Ground:
    """The walk grid (shared/worlds/caverns.ts: TERRAIN_HEIGHTS, cavernsFloorY, the mask), as read."""

    def __init__(self, T):
        self.n, self.cell, self.x0 = T["n"], T["cell"], T["x0"]
        self.h, self.s = T["heights"], T["surface"]
        self.mn, self.mc, self.m = T["maskN"], T["maskCell"], T["mask"]
        self.pools = T["pools"]

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

    def surf(self, x, z):
        """The surface (caverns.ts SURFACE) of the grid vertex nearest (x, z)."""
        i = min(max(int(round((x - self.x0) / self.cell)), 0), self.n - 1)
        k = min(max(int(round((z - self.x0) / self.cell)), 0), self.n - 1)
        return self.s[k * self.n + i]


def lake_factor(L, x, z):
    """How far out on the lake a point is against its shore (shared/worlds/caverns.ts lakeFactor):
    under 1 the water, 1 the waterline."""
    lk = L["lake"]
    dx, dz = (x - lk["x"]) / lk["rx"], (z - lk["z"]) / lk["rz"]
    a = math.atan2(dz, dx)
    wob = 1 + 0.08 * math.sin(2 * a + 0.4) + 0.06 * math.sin(3 * a + 0.7) + 0.04 * math.sin(5 * a + 2.1) + 0.025 * math.sin(9 * a + 1.3)
    return math.hypot(dx, dz) / wob


def polyline_distance(x, z, pts):
    best = float("inf")
    for (ax, az, *_), (bx, bz, *_) in zip(pts, pts[1:]):
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)))
        best = min(best, math.hypot(x - ax - vx * t, z - az - vz * t))
    return best


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


# ---------------------------------------------------------------------------------------------
# the terrain: the floor, which is the walk collider; the pedestal's skirt round its edge (the
# blockout: each zone's ground its own flat colour, the cliffs between levels darker, the trails pale)

SURF = {"basecamp": 0, "jungle": 1, "breakdown": 2, "mudflats": 3, "overlook": 4, "travertine": 5, "rift": 6, "shore": 7, "bed": 8, "trail": 9, "stream": 10, "pool": 11}
SURF_COLOUR = {0: "groundCamp", 1: "groundJungle", 2: "groundBreakdown", 3: "groundMud", 4: "groundOverlook", 5: "groundTravertine", 6: "groundRift", 7: "groundShore", 9: "groundTrail", 10: "groundStream", 11: "groundPool"}


def trail_zones(G):
    """For every trail vertex, the surface of the nearest ground off the trail (a few cells' search):
    a trail is that zone's ground trodden paler."""
    n = G.n
    trail = SURF["trail"]
    zone = {}
    frontier = [q for q in range(n * n) if G.s[q] != trail]
    seen = {q: G.s[q] for q in frontier}
    for _ in range(8):
        nxt = []
        for q in frontier:
            i, k = q % n, q // n
            for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ii, kk = i + di, k + dk
                if 0 <= ii < n and 0 <= kk < n:
                    r = kk * n + ii
                    if r not in seen:
                        seen[r] = seen[q]
                        nxt.append(r)
        frontier = nxt
    for q in range(n * n):
        if G.s[q] == trail:
            s = seen.get(q, SURF["shore"])
            zone[q] = SURF["shore"] if s in (SURF["bed"], SURF["stream"], SURF["pool"], trail) else s
    return zone


def terrain_colour(L, G, i, k, wd, trail_zone=None):
    """A floor vertex's colour: its zone's ground (a little mottled), the lake's bed by its depth, the
    shore wet where the water laps, and darker the steeper it stands (the cliffs read as cliffs)."""
    n = G.n
    q = k * n + i
    x, z = G.at(i, k)
    y = G.h[q]
    s = G.s[q]
    if s == SURF["bed"]:
        depth = L["lake"]["water"] - y
        c = mixc("sedimentWet", "bedShallow", smooth(0.02, 0.3, depth))
        c = mixc(c, "bedMid", smooth(0.3, 0.8, depth))
        return mixc(c, "bedDeep", smooth(0.8, 1.5, depth))
    if s == SURF["trail"] and trail_zone is not None:
        under = lin(C[SURF_COLOUR.get(trail_zone.get(q, SURF["shore"]), "groundShore")])
        base = mixc(tuple(v * 1.18 for v in under), "groundTrail", 0.38)
    else:
        base = lin(C[SURF_COLOUR.get(s, "groundShore")])
    k1 = 0.92 + 0.14 * (0.5 + 0.5 * fbm(x * 0.45, 0.3, z * 0.45, 11))
    c = (base[0] * k1, base[1] * k1, base[2] * k1)
    if s == SURF["shore"]:
        c = mixc(c, "sedimentWet", smooth(0.9, 0.0, wd) * 0.8)
    i0, i1 = max(0, i - 1), min(n - 1, i + 1)
    k0, k1_ = max(0, k - 1), min(n - 1, k + 1)
    gx = (G.h[k * n + i1] - G.h[k * n + i0]) / ((i1 - i0) * G.cell)
    gz = (G.h[k1_ * n + i] - G.h[k0 * n + i]) / ((k1_ - k0) * G.cell)
    return mixc(c, "cliffRock", smooth(0.5, 1.4, math.hypot(gx, gz)) * 0.7)


def build_terrain(G, L, floor):
    """The cavern's floor: a subdivided grid (a vertex every 0.5 m over the whole 45 x 45 m) displaced
    to the walk grid, so it IS the click collider (cavernsFloorY, triangle for triangle); its four edges
    carried down to -2.5 m (the pedestal's skirt, closing the box)."""
    n = G.n
    wd = water_distance(G, L)
    tz = trail_zones(G)
    cols = []
    counts = {}
    for k in range(n):
        for i in range(n):
            q = k * n + i
            counts[G.s[q]] = counts.get(G.s[q], 0) + 1
            cols.append(terrain_colour(L, G, i, k, wd[q], tz))
    names = {v: k for k, v in SURF.items()}
    GEO_STATS["floorMix"] = {names.get(s, str(s)): round(100 * c / (n * n), 1) for s, c in sorted(counts.items())}
    # (one light blur over the neighbours: the zones' seams soften)
    soft = []
    for k in range(n):
        for i in range(n):
            acc, wsum = [0.0, 0.0, 0.0], 0.0
            for dk in (-1, 0, 1):
                for di in (-1, 0, 1):
                    ii, kk = i + di, k + dk
                    if 0 <= ii < n and 0 <= kk < n:
                        w = 4.0 if di == 0 and dk == 0 else 1.0
                        c = cols[kk * n + ii]
                        acc = [acc[j] + c[j] * w for j in range(3)]
                        wsum += w
            soft.append(tuple(a / wsum for a in acc))
    verts = []
    for k in range(n):
        for i in range(n):
            x, z = G.at(i, k)
            q = k * n + i
            v = floor.v(x, G.h[q], z)
            floor.setv(v, soft[q])
            verts.append(v)
    # (each cell split along its (-x, -z) to (+x, +z) diagonal: cavernsFloorY's very triangles, up)
    for k in range(n - 1):
        for i in range(n - 1):
            a, b = verts[k * n + i], verts[k * n + i + 1]
            c, d = verts[(k + 1) * n + i], verts[(k + 1) * n + i + 1]
            floor.setsmooth(floor.face((a, d, b), "floor"))
            floor.setsmooth(floor.face((a, c, d), "floor"))
    # the pedestal's skirt: each edge's heights carried straight down to -2.5 m, facing out
    last = n - 1
    for cells, out in (([(i, 0) for i in range(n)], (0.0, 0.0, -1.0)), ([(i, last) for i in range(n)], (0.0, 0.0, 1.0)), ([(0, k) for k in range(n)], (-1.0, 0.0, 0.0)), ([(last, k) for k in range(n)], (1.0, 0.0, 0.0))):
        prev = None
        for i, k in cells:
            x, z = G.at(i, k)
            top = floor.v(x, G.h[k * n + i], z)
            bot = floor.v(x, SKIRT_Y, z)
            floor.setv(top, "skirt")
            floor.setv(bot, "skirtDark")
            if prev:
                floor.facing((prev[0], top, bot, prev[1]), "skirt", out, smooth_=True)
            prev = (top, bot)


# ---------------------------------------------------------------------------------------------
# the walls: the north and west limestone cliffs, leaning back as they rise (nothing overhangs, so
# nothing hangs over the view), hollowed round the nodes set in them; the adit's mouth and the
# forge's alcove open in the north wall


def wall_nodes(L):
    """The nodes set in the north and west walls: (the wall, along it, the node, its rock's size)."""
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


def wall_zones(along, u):
    """Which stretch of the shell a point of it faces (weights 0..1, blended over a metre or two):
    the jungle's broken rim (the collapse over the doline), the mudflats' rust-stained wall, the Great
    Wall's flowstone behind the terraces, the breakdown's fractured blocks."""
    if along == "x":
        return {"jungle": 1 - smooth(-11.0, -7.5, u), "breakdown": smooth(7.5, 10.5, u), "mud": 0.0, "great": 0.0}
    return {
        "jungle": 1 - smooth(-14.0, -10.5, u),
        "mud": smooth(-14.0, -10.5, u) * (1 - smooth(0.0, 2.5, u)),
        "great": smooth(0.0, 2.5, u) * (1 - smooth(16.0, 19.0, u)),
        "breakdown": 0.0,
    }


def wall_point(G, L, along, u, v, pockets):
    """A point of a wall's face, `u` along it and `v` up it (0 its foot, 1 its top): a damp foot
    standing in from the boundary, the face leaning back as it climbs, stepped by its bedding planes;
    over the jungle its top broken off in blocks (the collapse), behind the terraces the Great Wall's
    flowstone curtains, over the breakdown fractured into blocks; hollowed round the nodes set in it.
    Returns the point, how deep in a pocket it lies (0..1) and its stretch's weights."""
    half = L["half"]
    uc = max(-half + 0.1, min(half - 0.1, u))
    fx, fz = (uc, -half + 0.6) if along == "x" else (-half + 0.6, uc)
    foot = G.y(fx, fz) - 0.45
    zw = wall_zones(along, u)
    H = 8.6 + 1.2 * fbm(u * 0.11, 0.0, 3.0, 41)
    H += 2.6 * zw["great"]
    # (the collapse's broken lip: its top in stepped blocks, some fallen away low)
    jag = hash3(int(math.floor(u / 1.15)), 3, 7)
    H = H + (4.6 + 3.8 * jag - H) * zw["jungle"]
    y = foot + v * H
    inset = 0.58 - 0.5 * smooth(0.0, 1.0, v) + 0.2 * fbm(u * 0.3, y * 0.3, 0.7, 43) + 0.07 * fbm(u * 1.2, y * 1.1, 1.3, 47)
    # the bedding planes: a ledge every 0.9 m or so (a lip, then the bed below it tucked back)
    bed = ((y + 0.35 * fbm(u * 0.15, 0.0, 2.0, 49)) / 0.9) % 1.0
    inset += 0.16 * bed * (1 - zw["great"]) * (1 - 0.4 * zw["jungle"])
    # the Great Wall: flowstone curtains, vertical folds rippled down its face, standing more upright
    fold = 0.5 + 0.5 * math.sin(u * 2.2 + 1.3 * fbm(u * 0.4, y * 0.15, 5.0, 57))
    inset -= zw["great"] * (0.26 * fold + 0.08 * math.sin(u * 5.3 + y * 0.35))
    inset += zw["great"] * 0.3 * smooth(0.0, 1.0, v)
    # the breakdown's fractured blocks
    inset += zw["breakdown"] * 0.28 * (hash3(int(math.floor(u / 1.25)), int(math.floor(y / 1.4)), 9) - 0.5)
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
    return p, pocket, zw


def wall_colour(u, y, v, pocket, zw):
    band = 0.5 + 0.5 * math.sin(y * 3.1 + fbm(u * 0.2, y * 0.2, 0.0, 51) * 2.5)
    c = mixc("limestoneDark", "limestone", 0.15 + 0.7 * band)
    c = mixc(c, "limestoneLight", smooth(0.35, 0.8, fbm(u * 0.5, y * 0.5, 2.0, 53)) * 0.35)
    c = mixc(c, "strataDark", smooth(0.3, 0.6, fbm(u * 1.4, y * 2.6, 4.0, 55)) * 0.3)
    # the Great Wall's flowstone: cream, streaked tan down its folds
    streak = smooth(0.2, 0.7, fbm(u * 1.3, y * 0.12, 6.0, 59))
    c = mixc(c, mixc("travRock", "travRockDark", 0.15 + 0.45 * streak), zw["great"] * 0.92)
    c = mixc(c, "flowstone", zw["great"] * 0.3 * smooth(0.55, 0.9, streak))
    # the mudflats' wall: rust bleeding down it
    rust = smooth(0.25, 0.65, fbm(u * 1.7, y * 0.14, 8.0, 61))
    c = mixc(c, mixc("mudRock", "rustDark", 0.4 * band), zw["mud"] * rust * 0.75)
    # the jungle's rim: moss where the light falls, thickest up at the broken lip and down at the foot
    moss = smooth(0.15, 0.55, fbm(u * 0.6, y * 0.45, 3.0, 63)) * (0.45 + 0.55 * max(smooth(0.55, 0.95, v), smooth(0.25, 0.0, v)))
    c = mixc(c, mixc("mossDeep", "moss", band), zw["jungle"] * moss * 0.85)
    # the breakdown's fresh fractures: paler
    c = mixc(c, "limestoneLight", zw["breakdown"] * 0.3 * hash3(int(math.floor(u / 1.25)), int(math.floor(y / 1.4)), 11))
    c = mixc(c, "wallFoot", smooth(0.22, 0.0, v) * 0.85)
    c = mixc(c, "vault", smooth(0.75, 1.0, v) * 0.6 * (1 - zw["jungle"]))
    return mixc(c, "vug", pocket)


def build_walls(G, L, shell, glow, rng):
    half = L["half"]
    A, F = L["adit"], L["forge"]
    ady = G.y(A["x"], -half + 1.0)
    fdy = G.y(F["x"], F["z"])
    hw = A["w"] / 2
    pockets = wall_nodes(L)
    V = 28
    us = frange(-half - 1.0, half + 0.5, 0.45)
    for along in ("x", "z"):
        grid = []
        for u in us:
            col = []
            for j in range(V + 1):
                p, pk, zw = wall_point(G, L, along, u, j / V, pockets)
                vv = shell.v(*p)
                shell.setv(vv, wall_colour(u, p[1], j / V, pk, zw))
                col.append(vv)
            grid.append(col)
        for a in range(len(us) - 1):
            um = (us[a] + us[a + 1]) / 2
            for j in range(V):
                if along == "x":
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
        floor_y = G.y(nd["x"], nd["z"])
        ny = floor_y + r * 0.7
        R = r + 0.55
        for k in range(7):
            a = 2 * math.pi * k / 7 + rng.random() * 0.5
            du, dy = math.cos(a) * R, math.sin(a) * R * 1.1
            if ny + dy < floor_y + 0.05:
                continue
            if al == "x":
                base, d = (nu + du, ny + dy, -half + 0.2), (math.cos(a) * 0.3, 0.4 + 0.3 * math.sin(a), 0.9)
            else:
                base, d = (-half + 0.2, ny + dy, nu + du), (0.9, 0.4 + 0.3 * math.sin(a), math.cos(a) * 0.3)
            colr = "violet" if (k + int(nu)) % 3 == 0 else "cyan"
            prism(glow, base, d, 0.035 + 0.025 * rng.random(), 0.22 + 0.25 * rng.random(), colr, sides=5)


def build_adit(G, L, rock, glow):
    """The old mine adit up to the woods: its dark bore into the hill, timber sets propping its mouth
    with lagging over their caps, its rails on sleepers, a lantern hung from the first cap."""
    half = L["half"]
    A = L["adit"]
    hw = A["w"] / 2
    ady = G.y(A["x"], -half + 1.0)
    spring = ady + A["h"] - hw
    prof = [(-hw, ady - 0.1), (-hw, spring)] + [(-hw * math.cos(math.pi * k / 6), spring + hw * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(hw, spring), (hw, ady - 0.1)]
    depths = [-half + 1.1, -half - 0.4, -half - 1.8, -half - 3.2]
    rings = []
    for j, zz in enumerate(depths):
        ring = []
        for px, py in prof:
            v = rock.v(A["x"] + px * (1 - 0.06 * j), py, zz)
            rock.setv(v, mixc("stoneDark", "tunnel", j / (len(depths) - 1) * 1.2))
            ring.append(v)
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(len(prof) - 1):
            rock.setsmooth(rock.face((r0[k + 1], r0[k], r1[k], r1[k + 1]), "tunnel"))
    rock.face(list(reversed(rings[-1])), "tunnel")
    for j, zz in enumerate((-half + 0.9, -half - 0.5, -half - 1.9)):
        sp = 0.06 * j
        for sx in (-1, 1):
            px = A["x"] + sx * (hw - 0.05 - sp)
            box(rock, px - 0.1, px + 0.1, ady - 0.1, spring + 0.25, zz - 0.1, zz + 0.1, "timber" if j == 0 else "timberDark")
        box(rock, A["x"] - hw - 0.12 + sp, A["x"] + hw + 0.12 - sp, spring + 0.22, spring + 0.42, zz - 0.12, zz + 0.12, "timberDark")
    for k in range(6):
        zz = -half + 0.95 - k * 0.42
        box(rock, A["x"] - hw + 0.1, A["x"] + hw - 0.1, spring + 0.42, spring + 0.48, zz - 0.17, zz + 0.17, "plank" if k % 2 else "timber", bottom=False)
    # (the track: sleepers and two rails, from the dark out to the mouth)
    for k in range(9):
        zz = -half - 2.8 + k * 0.62
        box(rock, A["x"] - 0.62, A["x"] + 0.62, ady - 0.02, ady + 0.04, zz - 0.09, zz + 0.09, "timberDark", bottom=False)
    for sx in (-0.42, 0.42):
        box(rock, A["x"] + sx - 0.03, A["x"] + sx + 0.03, ady + 0.04, ady + 0.1, -half - 3.0, -half + 2.8, "steel", bottom=False)
    lantern(rock, glow, A["x"] + hw - 0.3, spring + 0.35, -half + 1.02, hang=0.36)


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
    tops = []
    for k, (px, pz) in enumerate(posts):
        py = G.y(px, pz)
        ht = Cp["ridge"] if k < 2 else Cp["eave"]
        cyl(rock, (px, py - 0.1, pz), (px, py + ht, pz), 0.07, "timber" if k % 2 else "timberDark", sides=6)
        tops.append((px, py + ht, pz))
    cyl(rock, tops[0], tops[1], 0.06, "timberDark", sides=6)
    cyl(rock, tops[2], tops[3], 0.05, "timber", sides=6)
    for a, b in ((0, 2), (1, 3)):
        cyl(rock, tops[a], tops[b], 0.045, "timber", sides=5)
    tarp(rock, [(tops[0][0] - 0.25, tops[0][1] + 0.08, tops[0][2] + 0.2), (tops[1][0] + 0.25, tops[1][1] + 0.08, tops[1][2] + 0.2), (tops[3][0] + 0.25, tops[3][1] + 0.05, tops[3][2] - 0.25), (tops[2][0] - 0.25, tops[2][1] + 0.05, tops[2][2] - 0.25)], 0.16, "canvas", "canvasShade")
    for t in (0.22, 0.78):
        lantern(rock, glow, tops[0][0] + (tops[1][0] - tops[0][0]) * t, tops[0][1] - 0.06, tops[0][2], hang=0.28)
    # the crate stack, iron-strapped, its specimen jars glowing with their finds
    cx, cz = Cp["crates"]
    cy = G.y(cx, cz)
    for dx, dz, w, d, h, y0 in ((-0.2, 0.0, 0.55, 0.5, 0.45, 0.0), (0.28, 0.02, 0.45, 0.45, 0.4, 0.0), (-0.12, 0.02, 0.5, 0.45, 0.38, 0.45)):
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
# the layout's rims, as shared/worlds/caverns.ts draws them (the same wobble, sine for sine)

LEVEL_SEED = {"rift": 3, "terraceC": 5, "terraceB": 7, "terraceA": 9, "overlook": 11, "mudflats": 13}


def wave(x, z, seed):
    """caverns.ts `wave`: a soft wavy field in about -1..1."""
    return 0.5 * math.sin(x * 0.61 + seed * 1.7 + math.sin(z * 0.43 + seed) * 1.3) + 0.35 * math.sin(z * 0.83 - seed * 0.9 + math.sin(x * 0.57) * 1.1) + 0.15 * math.sin((x + z) * 1.9 + seed * 2.3)


def polygon_distance(x, z, poly):
    """caverns.ts `polygonDistance`: signed, negative inside."""
    d = float("inf")
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        ax, az = poly[j]
        bx, bz = poly[i]
        vx, vz = bx - ax, bz - az
        t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)))
        d = min(d, math.hypot(x - (ax + vx * t), z - (az + vz * t)))
        if (bz > z) != (az > z) and x < (ax - bx) * (z - bz) / (az - bz) + bx:
            inside = not inside
        j = i
    return -d if inside else d


def level_distance(lv, x, z):
    s = LEVEL_SEED.get(lv["id"], 1)
    return polygon_distance(x, z, lv["poly"]) + lv["wob"] * wave(x * 0.9, z * 0.9, s) + 0.35 * lv["wob"] * wave(x * 2.3, z * 2.3, s + 17)


def shelf_rim_z(L, x):
    return L["shelf"]["edge"] + 0.35 * wave(x * 0.7, 0.3, 21) + 0.12 * wave(x * 2.1, 1.7, 23)


def near_polyline(x, z, pts):
    return polyline_distance(x, z, [(p[0], p[1]) for p in pts])


def rim_runs(L):
    """Every cliff's rim as runs of samples (x, z, outward normal, the cliff's half-width, its style):
    the north shelf's south edge (the jungle's, the basecamp's, the breakdown's and, over the rift,
    its crystal wall) and every level's edges (the mudflats, the overlook, the terraces' dams)."""
    runs = []
    c = L["shelf"]["cliff"]
    run = []
    for x in frange(-22.3, 22.3, 0.3):
        z = shelf_rim_z(L, x)
        dz = (shelf_rim_z(L, x + 0.05) - shelf_rim_z(L, x - 0.05)) / 0.1
        ln = math.hypot(dz, 1.0)
        style = "jungle" if x < -9.0 else "basecamp" if x < 9.0 else "breakdown" if x < 11.2 else "crystal"
        run.append((x, z, -dz / ln, 1.0 / ln, c, style))
    runs.append(run)
    styles = {"mudflats": "mud", "overlook": "overlook", "terraceA": "gour", "terraceB": "gour", "terraceC": "gour"}
    for lv in L["levels"]:
        if lv["id"] not in styles:
            continue
        poly = lv["poly"]
        for i in range(len(poly)):
            (ax, az), (bx, bz) = poly[i], poly[(i + 1) % len(poly)]
            ln = math.hypot(bx - ax, bz - az)
            dx, dz = (bx - ax) / ln, (bz - az) / ln
            nx, nz = dz, -dx
            mx, mz = (ax + bx) / 2, (az + bz) / 2
            if polygon_distance(mx + nx * 0.2, mz + nz * 0.2, poly) < polygon_distance(mx - nx * 0.2, mz - nz * 0.2, poly):
                nx, nz = -nx, -nz
            run = []
            for t in frange(-0.2, ln + 0.2, 0.3):
                px, pz = ax + dx * t, az + dz * t
                lo, hi = -1.6, 1.6
                if level_distance(lv, px + nx * lo, pz + nz * lo) > 0 or level_distance(lv, px + nx * hi, pz + nz * hi) < 0:
                    run.append(None)
                    continue
                for _ in range(16):
                    mid = (lo + hi) / 2
                    if level_distance(lv, px + nx * mid, pz + nz * mid) < 0:
                        lo = mid
                    else:
                        hi = mid
                s = (lo + hi) / 2
                run.append((px + nx * s, pz + nz * s, nx, nz, lv["cliff"], styles[lv["id"]]))
            runs.append(run)
    return runs


def cliff_shown(G, L, smp):
    """Whether a rim sample stands as a cliff the camera sees: a real drop there (not hidden under a
    level drawn over it), clear of the trails carved across it, the stream's falls and the map's edge."""
    x, z, nx, nz, c, _ = smp
    if abs(x) > 22.2 or abs(z) > 22.2:
        return False
    top = G.y(x - nx * (c + 0.3), z - nz * (c + 0.3))
    low = G.y(x + nx * (c + 0.3), z + nz * (c + 0.3))
    if top - low < 0.45:
        return False
    if any(near_polyline(x, z, p["points"]) < p["half"] + 0.95 for p in L["paths"]):
        return False
    Rv = L["river"]
    if any(near_polyline(x, z, seg) < Rv["half"] + 0.7 for seg in Rv["segments"]):
        return False
    return math.hypot(x - Rv["plunge"]["x"], z - Rv["plunge"]["z"]) > Rv["plunge"]["r"] + 0.8


CLIFF_BAND = {"jungle": 0.5, "basecamp": 0.55, "breakdown": 0.6, "crystal": 0.7, "overlook": 0.5, "mud": 0.45, "gour": 0.26}


def cliff_colour(style, t, y, u, band_i):
    """A cliff face's paint: `t` up it (0 its foot, 1 its lip), its strata by band, each band broken
    into blocks along it."""
    alt = 0.5 * (band_i % 2) + 0.9 * (hash3(int(math.floor(u / 0.9)), band_i, 5) - 0.5)
    if style == "gour":
        c = mixc("travRockDark", "travRock", 0.45 + 0.35 * alt + 0.15 * t)
        return mixc(c, "flowstone", 0.3 * smooth(0.5, 0.9, fbm(u * 0.8, y * 0.5, 1.0, 71)))
    if style == "crystal":
        c = mixc("basaltCol", "basaltColLight", 0.35 + 0.4 * alt)
        return mixc(c, "basaltTop", 0.5 * smooth(0.8, 1.0, t))
    if style == "mud":
        c = mixc("limestoneDark", "limestone", 0.35 + 0.4 * alt)
        return mixc(c, mixc("mudRock", "rustDark", 0.5 - 0.3 * t), 0.55 + 0.25 * smooth(0.3, 0.7, fbm(u * 1.4, y * 0.3, 2.0, 73)))
    base = {"jungle": ("limestoneDark", "limeCool"), "basecamp": ("strataDark", "strata"), "breakdown": ("limestoneDark", "limestoneLight"), "overlook": ("limestoneDark", "limestoneLight")}[style]
    c = mixc(base[0], base[1], 0.35 + 0.4 * alt + 0.1 * fbm(u * 0.9, y, 3.0, 75))
    if style == "jungle":
        c = mixc(c, mixc("mossDeep", "moss", 0.5 + alt), smooth(0.7, 1.0, t) * 0.85)
    return mixc(c, "wallFoot", smooth(0.25, 0.0, t) * 0.5)


def build_cliff_faces(G, L, rock, glow, rng):
    """Every cliff between two levels dressed as rock over the smooth slope under it: stepped strata
    (the jungle, the basecamp, the breakdown, the overlook, the mudflats' rust-stained bluffs),
    rimstone gours down the terraces' dams, columns of dark basalt with crystals in its joints down the
    crystal wall over the rift. Each face meets the ground at its lip and its foot (the walk surface is
    the floor under it: this is paint and relief, never a collider)."""
    K = 10
    made = 0
    for ri, run in enumerate(rim_runs(L)):
        prev = None
        u = 13.7 * ri
        last = None
        for smp in run:
            if smp is None or not cliff_shown(G, L, smp):
                prev = None
                continue
            x, z, nx, nz, c, style = smp
            if last is not None:
                u += math.hypot(x - last[0], z - last[1])
            last = (x, z)
            # the face's rows, evenly in height from its lip to its foot (found along the normal)
            s_top, s_low = -(c + 0.3), c + 0.3
            y_top = G.y(x + nx * s_top, z + nz * s_top)
            y_low = G.y(x + nx * s_low, z + nz * s_low)
            col = []
            for k in range(K + 1):
                t = 1 - k / K
                y = y_low + (y_top - y_low) * t
                lo, hi = s_top, s_low
                for _ in range(12):
                    mid = (lo + hi) / 2
                    if G.y(x + nx * mid, z + nz * mid) > y:
                        lo = mid
                    else:
                        hi = mid
                s = (lo + hi) / 2
                env = math.sin(math.pi * t) ** 0.6 if 0 < t < 1 else 0.0
                band = CLIFF_BAND[style]
                if style == "gour":
                    bulge = env * (0.07 + 0.09 * (0.5 + 0.5 * math.cos(2 * math.pi * y / 0.3)) + 0.04 * math.sin(u * 3.7))
                elif style == "crystal":
                    bulge = env * (0.1 + 0.14 * abs(math.sin(u * math.pi / 0.62)) + 0.04 * fbm(u, y, 1.0, 77))
                else:
                    ledge = ((y + 0.25 * fbm(u * 0.3, 0.0, 1.0, 79)) / band) % 1.0
                    bulge = env * (0.08 + 0.18 * ledge + 0.05 * fbm(u * 1.1, y * 1.3, 2.0, 81))
                col.append((rock.v(x + nx * (s + bulge), y, z + nz * (s + bulge)), t, y, int(math.floor(y / band))))
            if prev is not None:
                for k in range(K):
                    a0, a1, b1, b0 = prev[k], col[k], col[k + 1], prev[k + 1]
                    tm = (a0[1] + b0[1]) / 2
                    ym = (a0[2] + b0[2]) / 2
                    rock.facing([a0[0], a1[0], b1[0], b0[0]], cliff_colour(style, tm, ym, u, a0[3]), (nx, 0.25, nz))
                    made += 1
                # crystals in the crystal wall's joints, here and there
                if style == "crystal" and rng.random() < 0.18:
                    k = 2 + int(rng.random() * (K - 4))
                    px, py, pz = game_point(col[k][0].co)
                    colr = "violet" if rng.random() < 0.35 else "cyan"
                    for j in range(3):
                        prism(glow, (px - nx * 0.05, py - 0.05 * j, pz - nz * 0.05), (nx * 0.9 + (rng.random() - 0.5) * 0.6, 0.35 + 0.4 * rng.random(), nz * 0.9 + (rng.random() - 0.5) * 0.6), 0.03 + 0.03 * rng.random(), 0.18 + 0.25 * rng.random(), colr, sides=5)
            prev = col
    GEO_STATS["cliffQuads"] = made


# ---------------------------------------------------------------------------------------------
# the terraces' rimstone lips round their pools, the trails' edges, the map's rim


def build_terrace_lips(G, L, rock):
    """A rimstone lip round every warm pool: travertine grown a hand over the water at its brim."""
    for p in L["terraces"]["pools"]:
        rings = []
        for grow, dy, colr in ((-0.05, -0.04, "travRockDark"), (0.1, 0.14, "travRock"), (0.28, 0.1, "travRock"), (0.42, 0.06, "travRockDark")):
            _, outline = pool_outline(L, p, grow=grow)
            ring = []
            for x, z in outline:
                y = p["y"] + dy
                v = rock.v(x, y, z)
                rock.setv(v, colr)
                ring.append(v)
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            n = len(r0)
            for i in range(n):
                j = (i + 1) % n
                rock.setsmooth(rock.facing((r0[i], r0[j], r1[j], r1[i]), "travRock", (0.0, 1.0, 0.0)))


def build_trail_edges(G, L, rock, glow, rng):
    """The trails read as trails: along the rope descent wooden stakes and a rope on its drop side;
    along the others low stones lining the tread where it crosses a cliff; a cairn at each end."""
    for p in L["paths"]:
        pts = p["points"]
        half = p["half"]
        stakes = []
        for (ax, az, _), (bx, bz, _) in zip(pts, pts[1:]):
            ln = math.hypot(bx - ax, bz - az)
            dx, dz = (bx - ax) / ln, (bz - az) / ln
            step = 1.1 if p["id"] == "ropeDescent" else 0.7
            for t in frange(0.3, ln - 0.3, step):
                for side in (-1, 1):
                    ex, ez = ax + dx * t - dz * side * (half + 0.3), az + dz * t + dx * side * (half + 0.3)
                    gx = (G.y(ex + 0.25, ez) - G.y(ex - 0.25, ez)) / 0.5
                    gz = (G.y(ex, ez + 0.25) - G.y(ex, ez - 0.25)) / 0.5
                    steep = math.hypot(gx, gz)
                    if steep < 0.6 or G.walk(ex, ez):
                        continue
                    # (the drop side: the ground falls away from the tread there)
                    drop = G.y(ex, ez) < G.y(ax + dx * t, az + dz * t) - 0.12
                    if p["id"] == "ropeDescent":
                        if drop:
                            stakes.append((ex, G.y(ex, ez), ez))
                    elif drop or rng.random() < 0.5:
                        angular(rock, ex, G.y(ex, ez), ez, 0.16 + 0.1 * rng.random(), 0.18 + 0.1 * rng.random(), rng, "limestoneLight", "limestone", sink=0.12, npts=9)
        for x, y, z in stakes:
            cyl(rock, (x, y - 0.15, z), (x, y + 0.8, z), 0.05, "timberDark", sides=5)
        for (x0, y0, z0), (x1, y1, z1) in zip(stakes, stakes[1:]):
            if math.hypot(x1 - x0, z1 - z0) < 1.6:
                cyl(rock, (x0, y0 + 0.72, z0), (x1, y1 + 0.72, z1), 0.016, "canvasShade", sides=4)
        # a cairn beside each end of the trail
        for (x, z, _), (ox, oz, _) in ((pts[0], pts[1]), (pts[-1], pts[-2])):
            ln = math.hypot(ox - x, oz - z)
            cx, cz = x + (oz - z) / ln * (half + 0.45), z - (ox - x) / ln * (half + 0.45)
            y = G.y(cx, cz)
            for k in range(3):
                s = 0.22 - 0.05 * k
                angular(rock, cx + 0.02 * k, y + 0.1 * k, cz, s, 0.1, rng, "limestoneLight", "limestone", sink=0.02, squash=0.8, npts=8)


def build_rim(G, L, rock, water, rng):
    """The map's open edges (south and east, the camera's side): low broken rock along them, never
    tall enough to hide anything; the lake's outflow falling over the east rim into the dark."""
    half = L["half"]
    Rv = L["river"]
    out = Rv["segments"][-1]
    for along in ("z", "x"):
        for t in frange(-half + 0.8, half - 0.5, 1.15):
            x, z = (t, half - 0.3) if along == "z" else (half - 0.3, t)
            if along == "x" and abs(z - out[-2][1]) < 1.6:
                continue
            if rng.random() < 0.25:
                continue
            x += (rng.random() - 0.5) * 0.4
            z += (rng.random() - 0.5) * 0.4
            y = G.y(max(-half, min(half, x)), max(-half, min(half, z)))
            r = 0.3 + 0.35 * rng.random()
            angular(rock, x, y, z, r, r * (0.6 + 0.5 * rng.random()), rng, "limestone", "limestoneDark", sink=0.25, npts=11)
    # the outflow over the rim: a fall down the pedestal's side into the dark
    x0, z0 = out[-2]
    x1, z1 = out[-1]
    zc = z0 + (z1 - z0) * (half - x0) / (x1 - x0)
    top = G.y(half - 0.05, zc) + 0.12
    prev = None
    for j in range(7):
        t = j / 6
        y = top + (SKIRT_Y + 0.3 - top) * t
        xx = half + 0.05 + 0.35 * t ** 0.6
        l = water.v(xx, y, zc - 0.45 - 0.2 * t)
        r = water.v(xx, y, zc + 0.45 + 0.2 * t)
        for v in (l, r):
            water.setv(v, mixc("foam", "aqua", t))
        if prev:
            water.setsmooth(water.facing((prev[0], prev[1], r, l), "aqua", (1.0, 0.2, 0.0)))
        prev = (l, r)


# ---------------------------------------------------------------------------------------------
# the water: the Great Lake, the terraces' warm pools, the stream from the jungle's waterfall down
# through the mudflats and the pools into the lake, and its outflow east over the rim


def pool_outline(L, p, grow=0.0, segs=5):
    """A warm pool's outline: its rectangle with rounded corners (shared/worlds/caverns.ts
    poolDistance at `grow`), clockwise from above."""
    T = L["terraces"]
    r = 0.9
    cx, cz = (T["x0"] + T["x1"]) / 2, (p["z0"] + p["z1"]) / 2
    hx, hz = (T["x1"] - T["x0"]) / 2 - r, (p["z1"] - p["z0"]) / 2 - r
    rr = r + grow
    out = []
    for qx, qz, a0 in ((1, 1, 0.0), (-1, 1, 0.5 * math.pi), (-1, -1, math.pi), (1, -1, 1.5 * math.pi)):
        for j in range(segs + 1):
            a = a0 + 0.5 * math.pi * j / segs
            out.append((cx + qx * hx + math.cos(a) * rr, cz + qz * hz + math.sin(a) * rr))
    return (cx, cz), out


def pool_y_at(L, z):
    pools = L["terraces"]["pools"]
    return next((p["y"] for p in pools if p["z0"] - 0.1 <= z <= p["z1"] + 0.1), pools[-1]["y"])


def fan(M, centre, ring, y, col, out=(0.0, 1.0, 0.0)):
    c = M.v(centre[0], y, centre[1])
    M.setv(c, col)
    vs = []
    for x, z in ring:
        v = M.v(x, y, z)
        M.setv(v, col)
        vs.append(v)
    for a, b in zip(vs, vs[1:] + vs[:1]):
        M.setsmooth(M.facing((c, a, b), col, out))


def build_waters(G, L, rock, water, therm, ledge_top):
    n = G.n
    K = L["lake"]
    wy = K["water"]
    # the lake: its surface over every cell the water shows in, aqua over the shallows, dark over the deep
    wv = {}

    def wvert(i, k):
        if (i, k) not in wv:
            x, z = G.at(i, k)
            v = water.v(x, wy, z)
            d = wy - G.h[k * n + i]
            water.setv(v, mixc(mixc("aquaShallow", "aqua", smooth(0.05, 0.4, d)), "waterDark", smooth(0.5, 1.4, d)))
            wv[(i, k)] = v
        return wv[(i, k)]

    for k in range(n - 1):
        for i in range(n - 1):
            hs = [G.h[kk * n + ii] for ii, kk in ((i, k), (i + 1, k), (i, k + 1), (i + 1, k + 1))]
            x, z = G.at(i, k)
            if min(hs) > wy - 0.02 or lake_factor(L, x, z) > 1.45:
                continue
            water.setsmooth(water.facing([wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)], "aqua", (0.0, 1.0, 0.0)))
    # the terraces' warm pools, each with its seats' submerged ledges, and the overflow from one down
    # over the dam into the next
    T = L["terraces"]
    for p in T["pools"]:
        centre, ring = pool_outline(L, p, grow=0.05)
        fan(therm, centre, ring, p["y"], "thermalWater")
    for s in L["thermalSeats"]:
        top = pool_y_at(L, s["z"]) + ledge_top
        box(rock, s["x"] - 0.28, s["x"] + 0.28, top - 0.5, top, s["z"] - 0.28, s["z"] + 0.28, "travRockDark", top="travRock")
    pools = T["pools"]
    for (a, b), x in zip(zip(pools, pools[1:]), (-15.6, -14.6)):
        dz = (a["z1"] + b["z0"]) / 2
        q = [therm.v(x - 0.5, a["y"], a["z1"] - 0.2), therm.v(x + 0.5, a["y"], a["z1"] - 0.2), therm.v(x + 0.5, b["y"], b["z0"] + 0.3), therm.v(x - 0.5, b["y"], b["z0"] + 0.3)]
        for v in q:
            therm.setv(v, "aquaShallow")
        therm.facing(q, "aquaShallow", (0.0, 0.6, 0.8))
    # the stream: a ribbon over its channel, flat across, following the channel down (a fall where it
    # crosses a cliff); never over the lake's water, a pool or the plunge pool
    Rv = L["river"]
    Pp = Rv["plunge"]
    hw = Rv["half"] * 0.9

    def skip(x, z):
        if lake_factor(L, x, z) < 0.99 or math.hypot(x - Pp["x"], z - Pp["z"]) < Pp["r"]:
            return True
        return any(inside_poly(x, z, pool_outline(L, p, grow=0.1)[1]) for p in pools)

    ribbons = 0
    for seg in Rv["segments"]:
        samples = []
        for (ax, az), (bx, bz) in zip(seg, seg[1:]):
            ln = math.hypot(bx - ax, bz - az)
            m = max(1, int(ln / 0.3))
            for j in range(m):
                t = j / m
                samples.append((ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / ln, (bz - az) / ln))
        ax, az = seg[-1]
        samples.append((ax, az, samples[-1][2], samples[-1][3]))
        prev = None
        for x, z, tx, tz in samples:
            if skip(x, z):
                prev = None
                continue
            y = G.y(x, z) + 0.2
            # (white where it falls: a drop from the last sample)
            fall = smooth(0.06, 0.25, abs(y - prev[2])) if prev else 0.0
            l = water.v(x - tz * hw, y, z + tx * hw)
            r = water.v(x + tz * hw, y, z - tx * hw)
            for v in (l, r):
                water.setv(v, mixc(mixc("aqua", "waterDark", 0.35), "foam", fall))
            if prev:
                water.setsmooth(water.facing((prev[0], prev[1], r, l), "aqua", (0.0, 1.0, 0.0)))
                ribbons += 1
            prev = (l, r, y)
    GEO_STATS["streamQuads"] = ribbons
    # the plunge pool at the waterfall's foot, and the fall itself down the north wall from the
    # collapse's lip
    rim = min(G.y(Pp["x"] + math.cos(a) * (Pp["r"] + 0.3), Pp["z"] + math.sin(a) * (Pp["r"] + 0.3)) for a in (k * 0.4 for k in range(16)))
    py = rim - 0.15
    fan(water, (Pp["x"], Pp["z"]), [(Pp["x"] + math.cos(-a) * (Pp["r"] + 0.15), Pp["z"] + math.sin(-a) * (Pp["r"] + 0.15)) for a in (2 * math.pi * k / 20 for k in range(20))], py, "aqua")
    fx, fz = Rv["plunge"]["fall"]
    top_y = wall_point(G, L, "x", fx, 1.0, [])[0][1] - 0.35
    prev = None
    for j in range(9):
        t = j / 8
        y = top_y + (py - top_y) * t
        z = fz + 0.6 + (Pp["z"] - Pp["r"] * 0.3 - fz - 0.6) * t ** 3
        l = water.v(fx - 0.45 - 0.15 * t, y, z)
        r = water.v(fx + 0.45 + 0.15 * t, y, z)
        for v in (l, r):
            water.setv(v, mixc("aquaShallow", "aqua", t))
        if prev:
            water.setsmooth(water.facing((prev[0], prev[1], r, l), "aquaShallow", (0.0, 0.3, 1.0)))
        prev = (l, r)


# ---------------------------------------------------------------------------------------------
# the blockout's rock: the boulders, the host rock of every node that stands free, the rift's crystals
# and fungi, each in its zone's colours (the zones' own rock comes in their own phases)

ROCK_BY_SURF = {
    0: ("limestone", "limestoneDark"),
    1: ("moss", "limestoneDark"),
    2: ("limestoneLight", "limestone"),
    3: ("mudRock", "mudRockDark"),
    4: ("limestoneLight", "limestone"),
    5: ("travRock", "travRockDark"),
    6: ("basaltTop", "basaltCol"),
}


def zone_rock(G, x, z):
    return ROCK_BY_SURF.get(G.surf(x, z), ("limestone", "limestoneDark"))


def build_blockout_rocks(G, L, rock, glow, rng):
    for x, z, r in L["boulders"]:
        top, side = zone_rock(G, x, z)
        angular(rock, x, G.y(x, z), z, r, r * 1.05, rng, top, side, sink=0.2, npts=14)
    # the host rock behind every node that stands free (nodeBackRock)
    for nd in L["nodes"]:
        if nd["kind"] == "monolith" or nd["z"] < -21.2 or nd["x"] < -21.2:
            continue
        r = ORE_RADII.get(nd["kind"], 0.5)
        fx, fz = nd["face"]
        fl = math.hypot(fx, fz) or 1.0
        bx, bz = nd["x"] - fx / fl * (r + 0.45), nd["z"] - fz / fl * (r + 0.45)
        top, side = zone_rock(G, bx, bz)
        angular(rock, bx, G.y(bx, bz), bz, r + 0.35, r * 1.8, rng, top, side, sink=0.25, npts=14)
    for x, z, s in L["crystals"]:
        crystal_cluster(glow, rock, x, G.y(x, z), z, s, rng)
    for x, z, s in L["shrooms"]:
        fungi(rock, glow, x, G.y(x, z), z, s, rng)


def build_hounds_hand(G, L, rock, roots, rng):
    """The Hound's Hand: the giant stalagmite on the overlook (after Son Doong's Hand of Dog), in the
    dithered finish so it never hides you."""
    Tw = L["tower"]
    y = G.y(Tw["x"], Tw["z"])
    stalagmite(roots, Tw["x"], y, Tw["z"], Tw["r"], Tw["h"])
    stalagmite(roots, Tw["x"] + 0.9, y, Tw["z"] + 0.4, Tw["r"] * 0.45, Tw["h"] * 0.42)
    lump(roots, Tw["x"], y, Tw["z"], Tw["r"] * 1.6, 0.6, Tw["r"] * 1.5, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.2, sink=0.4)


def build_winch(G, L, rock, glow):
    """Gus's winch lift: a timber gantry at the coal breakdown's edge, its boom out over the cliff, the
    rope down to a plank cage on the glimmer rift's floor."""
    Wn = L["winch"]
    x, zt, zb = Wn["x"], Wn["top"], Wn["bottom"]
    yt, yb = G.y(x, zt), G.y(x, zb)
    for sx in (-0.7, 0.7):
        cyl(rock, (x + sx, yt - 0.1, zt), (x + sx, yt + 2.6, zt), 0.09, "timberDark", sides=6)
        cyl(rock, (x + sx, yt - 0.1, zt - 0.8), (x + sx, yt + 2.2, zt), 0.06, "timber", sides=5)
    cyl(rock, (x - 0.85, yt + 2.5, zt), (x + 0.85, yt + 2.5, zt), 0.08, "timber", sides=6)
    cyl(rock, (x, yt + 2.5, zt - 0.4), (x, yt + 2.55, zb), 0.07, "timber", sides=6)
    cyl(rock, (x, yt + 1.2, zt), (x, yt + 2.45, zt + (zb - zt) * 0.55), 0.05, "timberDark", sides=5)
    cyl(rock, (x - 0.55, yt + 0.85, zt - 0.45), (x + 0.55, yt + 0.85, zt - 0.45), 0.2, "timberDark", sides=8)
    cyl(rock, (x + 0.55, yt + 0.85, zt - 0.45), (x + 0.75, yt + 1.1, zt - 0.45), 0.03, "iron", sides=4)
    cyl(rock, (x, yt + 2.5, zb), (x, yb + 2.0, zb), 0.02, "canvasShade", sides=4)
    box(rock, x - 0.6, x + 0.6, yb - 0.05, yb + 0.08, zb - 0.6, zb + 0.6, "plank")
    for dx, dz in ((-0.55, -0.55), (0.55, -0.55), (0.55, 0.55), (-0.55, 0.55)):
        cyl(rock, (x + dx, yb, zb + dz), (x + dx, yb + 2.0, zb + dz), 0.04, "timber", sides=5)
    for (ax, az), (bx, bz) in (((-0.55, -0.55), (0.55, -0.55)), ((0.55, -0.55), (0.55, 0.55)), ((0.55, 0.55), (-0.55, 0.55)), ((-0.55, 0.55), (-0.55, -0.55))):
        cyl(rock, (x + ax, yb + 2.0, zb + az), (x + bx, yb + 2.0, zb + bz), 0.035, "timberDark", sides=4)
        cyl(rock, (x + ax, yb + 1.0, zb + az), (x + bx, yb + 1.0, zb + bz), 0.025, "timber", sides=4)
    lantern(rock, glow, x + 0.7, yt + 2.45, zt, hang=0.3)
    lantern(rock, glow, x + 0.55, yb + 2.0, zb + 0.55, hang=0.25)


def build_causeway(G, L, rock, rng):
    """The stepping stones out to the Monolith's islet: flat stones along the causeway, a hand's depth
    over the water."""
    pts = L["causeway"]["points"]
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        ln = math.hypot(bx - ax, bz - az)
        m = max(1, int(ln / 0.85))
        for j in range(m):
            t = (j + 0.5) / m
            x, z = ax + (bx - ax) * t + (rng.random() - 0.5) * 0.25, az + (bz - az) * t + (rng.random() - 0.5) * 0.25
            angular(rock, x, G.y(x, z) + 0.02, z, 0.36, 0.1, rng, "limestoneLight", "limestone", sink=0.05, squash=0.8, npts=10)


# ---------------------------------------------------------------------------------------------
# the world


def build_world(G, L, coll, ledge_top):
    half = L["half"]
    floor = Mesh("CV_Clay")
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    water = Mesh("CV_Water")
    therm = Mesh("CV_ThermalWater")
    lt, Cp, F = L["lights"], L["camp"], L["forge"]

    # the light painted in: the lamps and the fires (the layout's lights stand that high over what is
    # under them)
    add_light(lt["forge"][0], G.y(lt["forge"][0], lt["forge"][2]) + lt["forge"][1], lt["forge"][2], "#FF8A3A", 1.4, 6.0)
    add_light(F["x"], G.y(F["x"], F["z"] + 1.2) + 1.1, F["z"] + 0.1, "#FF5A1F", 1.2, 3.2)
    add_light(F["x"], G.y(F["x"], F["z"] + 1.2) + 0.5, F["z"] + 1.0, "#FF7A2F", 1.0, 2.6)
    add_light(lt["thermal"][0], pool_y_at(L, lt["thermal"][2]) + lt["thermal"][1], lt["thermal"][2], "#FFE9C4", 1.1, 7.0)
    add_light(lt["cenote"][0], L["lake"]["water"] + lt["cenote"][1], lt["cenote"][2], "#35E6FF", 0.9, 8.0)
    add_light((Cp["posts"][0][0] + Cp["posts"][1][0]) / 2, G.y(L["workstation"]["x"], L["workstation"]["z"]) + 2.2, Cp["posts"][0][1], "#FFB347", 1.4, 5.0)
    add_light(L["adit"]["x"] + 0.7, G.y(L["adit"]["x"], -half + 1.5) + 2.0, L["adit"]["z"] + 0.9, "#FFB347", 1.2, 4.5)
    add_light(L["finnegan"]["x"] + 0.7, G.y(L["finnegan"]["x"], L["finnegan"]["z"]) + 0.5, L["finnegan"]["z"] + 0.3, "#FFB347", 1.0, 4.0)
    add_light(L["winch"]["x"], G.y(L["winch"]["x"], L["winch"]["top"]) + 2.2, L["winch"]["top"], "#FFB347", 1.0, 4.0)
    for x, z, s in L["crystals"]:
        add_light(x, G.y(x, z) + 0.5 * s, z, "#00F5D4", 0.3 * s, 1.1 * s)

    build_terrain(G, L, floor)
    build_walls(G, L, shell, glow, random.Random(19))
    build_adit(G, L, rock, glow)
    build_camp(G, L, rock, glow)
    build_forge_alcove(G, L, rock, glow, water, random.Random(31))
    build_waters(G, L, rock, water, therm, ledge_top)
    build_cliff_faces(G, L, rock, glow, random.Random(23))
    build_terrace_lips(G, L, rock)
    build_trail_edges(G, L, rock, glow, random.Random(29))
    build_rim(G, L, rock, water, random.Random(41))
    build_blockout_rocks(G, L, rock, glow, random.Random(11))
    build_hounds_hand(G, L, rock, roots, random.Random(13))
    build_winch(G, L, rock, glow)
    build_causeway(G, L, rock, random.Random(17))

    for f in glow.bm.faces:
        glow.setsmooth(f)
    build_fauna_templates(coll)
    finish_object("caverns_walk_collider", floor, coll, mottle=0.03)
    finish_object("Cave_Rock", rock, coll, mottle=0.06)
    finish_object("Cave_Shell", shell, coll, mottle=0.06)
    finish_object("Cave_Roots", roots, coll, mottle=0.06)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)


# ---------------------------------------------------------------------------------------------
# the templates the game instances: the fauna and the ore nodes' rocks


def build_fauna_templates(coll):
    """The glowing cave crab and the swiftlet, at the origin (drawn instanced, never here)."""
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
    finish_object("Fauna_Crab", crab, coll, bake=False)
    finish_object("Fauna_Swift", swift, coll, bake=False)


def ore_rock(kind, r, coll):
    rock = Mesh("CV_OreRock")
    glow = Mesh("CV_OreGlow")
    rng = random.Random(sum(ord(c) for c in kind) * 97)
    if kind == "monolith":
        # a tall obelisk of dark stone, bevelled, cracked with violet runes
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
            rock.setf(f, body if f.normal.z > 0.35 else dark)
        # the mineral: some facets its colour, a few of those glowing (an inset copy of the facet a
        # hair out along its normal, in the glow finish)
        picks = [f for f in faces if f.normal.z > -0.2]
        rng.shuffle(picks)
        for k, f in enumerate(picks[: 7 if kind != "glimmer" else 3]):
            rock.setf(f, fac)
            if k < (4 if kind in ("silver", "copper") else 3):
                c = f.calc_center_median()
                inset = [bm_v.co + (c - bm_v.co) * 0.45 + f.normal * 0.006 for bm_v in f.verts]
                glow.face([glow.bm.verts.new(p) for p in inset], glowc)
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
    for f in chunk(rubble, 0.36, 0.26, rng, sink=0.1, squash=0.85):
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
# the export: packed


def quantize_glb(path, names_prefix=("Cave_", "caverns_walk_collider")):
    """KHR_mesh_quantization over the static meshes: positions as 16-bit (the node carrying the
    offset and scale), normals as 8-bit, colours as 8-bit."""
    import struct

    raw = open(path, "rb").read()
    jlen = struct.unpack_from("<I", raw, 12)[0]
    js = json.loads(raw[20 : 20 + jlen].decode("utf-8"))
    off = 20 + jlen
    blen = struct.unpack_from("<I", raw, off)[0]
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
        stride = v.get("byteStride", n * csize[a["componentType"]])
        base = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from("<" + fmt[a["componentType"]] * n, bin_, base + i * stride) for i in range(a["count"])]

    new_data = {}  # accessor index -> (bytes, byteStride)
    changed = 0
    for node in js["nodes"]:
        if "mesh" not in node or not node.get("name", "").startswith(names_prefix):
            continue
        if any(k in node for k in ("translation", "rotation", "scale", "matrix")) or node.get("children"):
            continue
        mesh = js["meshes"][node["mesh"]]
        pts = [read(p["attributes"]["POSITION"]) for p in mesh["primitives"]]
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
                q = [max(0, min(65535, int(round((p[j] - lo[j]) / scale[j])) if hi[j] > lo[j] else 0)) for j in range(3)]
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
        nv = dict(v)
        nv["byteOffset"] = len(out)
        out += bin_[start : start + v["byteLength"]]
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
    packed = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    open(path, "wb").write(packed)
    return {"quantized": changed, "bytes": len(packed)}


def build(root):
    LIGHTS.clear()
    GEO_STATS.clear()
    coll = clean_caverns_collection()
    L = read_layout(root)
    ORE_RADII.clear()
    ORE_RADII.update(read_ore_radii(root))
    G = Ground(read_terrain(root))
    build_world(G, L, coll, read_thermal_ledge(root))
    ores = build_ores(coll, ORE_RADII)
    return coll, L, ores


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    # (only this collection's objects selected, one by one: never select_all)
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
    report = globals().get("REPORT_PATH") or os.environ.get("CAVERNS_REPORT")
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
