"""The caverns builder's kit: the finishes and the palette (`C`), the colours' and coordinates'
helpers (`lin`, `mixc`, `W`: the game's (x, y up, z) to Blender's), the files read (the layout, the
nodes' radii, the thermal ledge, the terrain), noise, the mesh and its primitives (`Mesh`, `slab`,
`box`, `cyl`, `blob`, `prism`, `lathe`, `chunk`, `lump`...), the small pieces every zone uses
(stalagmites, ferns, lanterns, crystals, fungi, reeds) and the light painted in (`LIGHTS`, `lit`, the
zones' tints, `ZONE_TINT`). The run's shared records (`ORE_RADII`, `GEO_STATS`, `LIGHTS`) are
filled and cleared in place, never rebound."""

import json
import math
import random
import os
import re

import bmesh
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
    # wood, metal, cloth, stone work
    "timber": "#7A5536",
    "timberDark": "#5A3D27",
    "plank": "#9C7148",
    "iron": "#3A3836",
    "stew": "#7A4A26",
    "steel": "#8E949C",
    "leather": "#6B4228",
    "canvas": "#C8B894",
    "canvasShade": "#A8977A",
    "brass": "#C9A24A",
    "brassDark": "#8C6B2A",
    "glass": "#CFE3E0",
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
    "copperNug": "#D9803F",
    "copperGlow": "#FFB070",
    "rust": "#8A4B2A",
    "silverVein": "#DFF6FF",
    "glimmerBase": "#2A2D3A",
    "monolith": "#2B2433",
    "monolithEdge": "#3C3348",
    "rubble": "#2F2B30",
    "rubbleCrack": "#1A181C",
    # the blockout's grounds, one per zone (shared/worlds/caverns.ts SURFACE)
    "groundCamp": "#8A7456",
    "groundJungle": "#475E36",
    "groundBreakdown": "#666971",
    "groundMud": "#8C6246",
    "groundOverlook": "#8A8579",
    "groundTravertine": "#B0A58B",
    "groundRift": "#2B2838",
    "groundShore": "#675D4E",
    "groundTrail": "#C9AE7C",
    "groundStream": "#3A4A52",
    "groundPool": "#6FA89E",
    "bedDeep": "#0B2A34",
    "foam": "#E6FAF6",
    "driftPale": "#A89A86",
    "pebble": "#8C8A86",
    "pebbleDark": "#5E5C59",
    "skyLow": "#FFF0C8",
    "skyHigh": "#A8CCE6",
    # phase 3: each zone's own ground, plants and gear
    "mossLight": "#5F7E40",
    "leafLitter": "#7A5B38",
    "leafAmber": "#A0662E",
    "leafGreen": "#5A7A34",
    "soilDark": "#3A3A2A",
    "campTrodden": "#A58D68",
    "campSoil": "#6E5C44",
    "gravelLight": "#9A9DA3",
    "gravelDark": "#5E6168",
    "mudCrack": "#5A3A28",
    "mudPlate": "#9A6A48",
    "mudPlateLight": "#AE8058",
    "mudWater": "#8A4A2A",
    "riftGlint": "#3A3050",
    "lakeShallow": "#46C9A4",
    "lakeMid": "#1E9A94",
    "trunk": "#6E6052",
    "trunkDark": "#4E4238",
    "canopy": "#2F5F2B",
    "canopyLight": "#4E8A36",
    "canopyDark": "#22452A",
    "canopyWarm": "#46702C",
    "blossom": "#E6A2C4",
    "mossHang": "#5E7A3A",
    "raftLog": "#6E4B30",
    "abyssCyan": "#1C5F5A",
    "abyssViolet": "#35275A",
    "vine": "#4A7A30",
    "vineLeaf": "#7AB04A",
    "pearl": "#F4F0E4",
    "glowworm": "#9FFFE8",
    "barrel": "#7A5536",
    "bedroll": "#8C3A2E",
    "mapPaper": "#E8D8A8",
    "mapInk": "#6A5236",
    "batBody": "#2A2226",
    "batWing": "#3A2C30",
    # phase 4: the ore nodes' own minerals
    "shale": "#8A857C",
    "shaleLight": "#A8A298",
    "coalSheen": "#2C2C38",
    "anthracite": "#B8C8FF",
    "malachite": "#4DB384",
    "azurite": "#4FB4B0",
    "copperDark": "#A35A2A",
    "hematite": "#6A626E",
    "hematiteSheen": "#ACA4B4",
    "ironGlint": "#FFD6B8",
    "calcite": "#C4CAD4",
    "calciteLight": "#E4E8EE",
    "calciteDark": "#8E96A2",
    "silverDark": "#9AA6B4",
    # (the polish pass: every ore dark against its own zone's ground, so it reads on a phone)
    "coalBlack": "#1C1B21",
    "coalFacet": "#3A3B4A",
    "ironDark": "#34333D",
    "ironBand": "#A5402A",
    "ironMetal": "#8E93A6",
    "silverHost": "#4C5566",
    "silverHostDark": "#333A48",
    "silverNugget": "#EEF6FF",
    "mudRock": "#9A6A48",
    "mudRockDark": "#684530",
    "travRock": "#CCC4AF",
    "greatCream": "#D4C29C",
    "greatAmber": "#B48D60",
    "greatShadow": "#6E604F",
    "travRockDark": "#B8AF98",
    # (round 3: what the expedition left along its way)
    "ribbon": "#A8483A",
    "ribbonFaded": "#B8806A",
    "chalk": "#E4DFD2",
    "canteen": "#5C6446",
    "ash": "#6A655E",
    "shingle": "#6E5236",
    "shingleDark": "#4E3A26",
    "shingleLight": "#86674A",
    "travWet": "#8C8270",
    "travAmber": "#C2A57A",
    "travOchre": "#B08A5A",
    # (the Hound's Hand's own calcite: its streaks and mottling are its own, the floor's rock strata
    # never painted over it)
    "handCalcite": "#8A857B",
    "handShade": "#4D4F55",
    "handCream": "#D4C29C",
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


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "caverns.ts"), encoding="utf-8").read()
    return json.loads(re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1))


def read_ore_radii(root):
    """Each node kind's rock radius (shared/caverns_mining.ts ORE_KINDS): the rocks are that big."""
    src = open(os.path.join(root, "shared", "caverns_mining.ts"), encoding="utf-8").read()
    out = {}
    for kind in ("coal", "copper", "iron", "silver", "glimmer", "monolith", "rockfall"):
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


# what is made or grown, never rock: its faces' colour alpha 0, so the game's surface detail
# (client/src/scene/caveSurface.ts: cracks, strata, moss, grain) leaves them plain
PLAIN = {
    "timber", "timberDark", "plank", "iron", "steel", "leather", "canvas", "canvasShade", "brass", "brassDark", "glass",
    "barrel", "bedroll", "mapPaper", "mapInk", "trunk", "trunkDark", "canopy", "canopyLight", "canopyDark", "vine", "vineLeaf", "canopyWarm", "blossom", "mossHang", "raftLog",
    "fern", "fernLight", "reedPale", "reedPaleDark", "leafLitter", "leafAmber", "leafGreen", "driftPale", "pearl",
    "moss", "mossDeep", "mossLight", "skyLow", "skyHigh", "shroomStem",
    "ribbon", "ribbonFaded", "chalk", "canteen", "shingle", "shingleDark", "shingleLight", "handCalcite", "handShade", "handCream",
}


class Mesh:
    """Faces with a colour each (a palette index in the face layer "ci"); a vertex may carry its own
    colour (the vert layer "vc", index + 1: shared by every smooth face round it) and a face be
    smooth shaded ("sm"). (BMesh layers, not dicts: an element's Python wrapper is no key.) The
    colours named in PLAIN are noted (`plain`): their faces export with alpha 0."""

    def __init__(self, finish):
        self.finish = finish
        self.bm = bmesh.new()
        self.colors = []
        self.plain = set()
        self._index = {}
        self.fl = self.bm.faces.layers.int.new("ci")
        self.fs = self.bm.faces.layers.int.new("sm")
        # (a flat face that still takes its vertices' own colours: faceted, but painted)
        self.fv = self.bm.faces.layers.int.new("fv")
        self.vl = self.bm.verts.layers.int.new("vc")

    def ci(self, col):
        rgb = lin(col) if isinstance(col, str) else tuple(col)
        key = tuple(round(c, 5) for c in rgb)
        if key not in self._index:
            self._index[key] = len(self.colors)
            self.colors.append(rgb)
        if isinstance(col, str) and col in PLAIN:
            self.plain.add(self._index[key])
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

    def setpainted(self, f):
        f[self.fv] = 1
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


# each zone's light, baked into what stands in it (docs/caverns-design.md phase 5): the jungle's green
# gold under the collapse, the basecamp's lantern warmth, the breakdown's cool grey, the mudflats' dim
# warm orange, the rift's cool violet, the terraces' cool white, the lake's teal; soft at their edges
ZONE_TINT = (
    (-22.5, -9.0, -22.5, -12.25, (1.02, 1.04, 0.9)),
    (-9.0, 9.0, -22.5, -12.25, (1.06, 1.0, 0.9)),
    (9.0, 22.5, -22.5, -12.25, (0.93, 0.97, 1.04)),
    (-22.5, -6.5, -12.25, 1.5, (1.0, 0.92, 0.84)),
    (-8.5, 11.0, -12.25, -3.0, (1.0, 0.99, 0.97)),
    (11.0, 22.5, -12.25, 5.5, (0.8, 0.82, 1.06)),
    (-22.5, -5.5, 1.5, 22.5, (0.95, 1.0, 1.05)),
    (-5.5, 22.5, -3.0, 22.5, (0.9, 1.0, 1.02)),
)


def zone_tint(x, z):
    acc, wsum = [0.2, 0.2, 0.2], 0.2
    e = 1.4
    for x0, x1, z0, z1, (r, g, b) in ZONE_TINT:
        w = smooth(x0 - e, x0 + e, x) * (1 - smooth(x1 - e, x1 + e, x)) * smooth(z0 - e, z0 + e, z) * (1 - smooth(z1 - e, z1 + e, z))
        if w > 0:
            acc = [acc[0] + r * w, acc[1] + g * w, acc[2] + b * w]
            wsum += w
    return acc[0] / wsum, acc[1] / wsum, acc[2] / wsum


def ambient_at(p):
    """The model's own base light: even, a touch dimmer up the walls' heights, each zone's own tint."""
    fade = 1 - 0.18 * smooth(5.0, 10.0, p[1])
    t = zone_tint(p[0], p[2])
    return (0.94 * fade * t[0], 0.95 * fade * t[1], 0.98 * fade * t[2])



def broken_slab(M, c, rot, hx, hy, hz, rng, top="limestoneLight", side="limestone", under="limestoneDark"):
    """A tabular block broken off the roof: the hull of a box's corners knocked about and points
    along its edges pushed in and out, so its sides are fractures, never sawn faces."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                # (a corner knocked off now and then: never a box's square shoulder)
                k = (0.5 if rng.random() < 0.35 else 0.75) + 0.3 * rng.random()
                ox, oy, oz = rot(sx * hx * k, sy * hy * (0.7 + 0.4 * rng.random()), sz * hz * (0.6 + 0.45 * rng.random()))
                pts.append(bm.verts.new(W(c[0] + ox, c[1] + oy, c[2] + oz)))
    for _ in range(16):
        a = rng.random() * 2 * math.pi
        sy = 1 if rng.random() < 0.5 else -1
        k = 0.75 + 0.4 * rng.random()
        ox, oy, oz = rot(math.cos(a) * hx * k, sy * hy * (0.7 + 0.3 * rng.random()), math.sin(a) * hz * k)
        pts.append(bm.verts.new(W(c[0] + ox, c[1] + oy, c[2] + oz)))
    hull = bmesh.ops.convex_hull(bm, input=pts)
    bm.verts.index_update()
    junk = list({g.index: g for g in hull["geom_interior"] + hull["geom_unused"] if isinstance(g, bmesh.types.BMVert)}.values())
    if junk:
        bmesh.ops.delete(bm, geom=junk, context="VERTS")
    for f in [f for f in bm.faces if any(not v.tag for v in f.verts)]:
        f.normal_update()
        M.setf(f, top if f.normal.z > 0.6 else (side if f.normal.z > -0.2 else under))
    for v in bm.verts:
        v.tag = False



def menhir(M, x, y, z, w, d, h, yaw, rng, top, side):
    """A weathered standing stone (docs/caverns-roadmap.md R7.1): a slab broader than it is thick,
    its sides leaning in a little as they rise, its edges rounded by the years, its top broken off at a
    slant, never a spindle."""
    c, s = math.cos(yaw), math.sin(yaw)
    levels = []
    for j, (t, k) in enumerate(((0.0, 1.0), (0.35, 0.96), (0.7, 0.9), (1.0, 0.82))):
        ring = []
        for q in range(8):
            a = 2 * math.pi * q / 8 + 0.39
            # (an octagon squashed to a slab, each corner its own wear)
            u = math.cos(a) * w * k * (0.88 + 0.2 * rng.random())
            v = math.sin(a) * d * k * (0.85 + 0.25 * rng.random())
            hy = y - 0.15 + (h + 0.15) * t
            if j == 3:
                # (the break at its top: a slant across it, ragged)
                hy -= (0.22 * (u / w) + 0.08 * rng.random()) * h * 0.4
            ring.append(M.v(x + u * c - v * s, hy, z + u * s + v * c))
        levels.append(ring)
    for r0, r1 in zip(levels, levels[1:]):
        for q in range(8):
            q1 = (q + 1) % 8
            M.face((r0[q], r0[q1], r1[q1], r1[q]), side)
    M.face(levels[-1], top)


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
