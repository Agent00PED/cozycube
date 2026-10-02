"""Shapes and paint shared by the camp worlds' builders (build_campfire.py, build_forest.py): the
nature pass (docs/maps-nature-pass.md).

    conifer     a pine, a spruce or a cedar: a tapered trunk that shows, and tiers of drooping boughs
                with ragged tips, each tree its own lean, girth and turn (never a stack of cones)
    snag        a dead standing tree: a bare grey trunk, broken off, a few stubs of branches
    Shade       what lies under things: a soft dark pool under every crown and a contact shadow at
                the foot of what stands (the game draws no shadows: without these, everything
                floats), and the litter a tree drops (needles, leaves)
    clumps      places in clusters, not rows: a few dense groups and open ground between

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts."""

import math

from mathutils import Vector


def W(x, y, z):
    return Vector((x, -z, y))


# each kind of conifer: its tiers, the lowest rim's radius and height, its top (all times its size)
CONIFERS = {
    "pine": {"tiers": 4, "r0": 1.0, "y0": 0.68, "top": 2.9, "taper": 0.7, "droop": 0.1},
    "spruce": {"tiers": 5, "r0": 0.74, "y0": 0.6, "top": 3.25, "taper": 0.74, "droop": 0.14},
    "cedar": {"tiers": 5, "r0": 0.95, "y0": 0.85, "top": 3.65, "taper": 0.68, "droop": 0.08},
    "sapling": {"tiers": 3, "r0": 0.9, "y0": 0.5, "top": 2.4, "taper": 0.7, "droop": 0.08},
}


def conifer(bm, x, z, s, rng, m_bark, m_needles, kind="pine", bare=0.0, yaw=None, lean=0.07, y=0.0):
    """A conifer standing at the game point (x, y, z), `s` its size. `m_needles`: the boughs'
    material indices from the lowest tier's to the top's (one to three: the low boughs stand in the
    shade of the rest). `bare`: that much more bare trunk under the boughs. Each tier is a loose
    part (a builder that lifts part by part stands it on the ground under the tree)."""
    K = CONIFERS[kind]
    n = K["tiers"]
    top = K["top"] * s * rng.uniform(0.94, 1.08) + bare
    a0 = rng.random() * 6.283 if yaw is None else yaw
    la = rng.random() * 6.283
    lx, lz = math.cos(la) * lean * s * rng.random(), math.sin(la) * lean * s * rng.random()
    at = lambda h: (x + lx * (h / top) ** 1.5, z + lz * (h / top) ** 1.5)  # the trunk's line, leaning
    girth = rng.uniform(0.9, 1.12)
    rims = [K["y0"] * s + bare + (top - 0.62 * s - K["y0"] * s - bare) * (k / (n - 1)) ** 0.92 for k in range(n)]
    # the trunk: flared at the foot, tapering up into the boughs
    rings = []
    for h, r in ((-0.06, 0.21), (0.1 * s, 0.15), (rims[0] + 0.3 * s, 0.11), (rims[min(1, n - 1)] + 0.25 * s, 0.07)):
        cx, cz = at(max(0.0, h))
        rings.append([bm.verts.new(W(cx + math.cos(a0 + 6.283 * i / 7) * r * s * girth, y + h, cz + math.sin(a0 + 6.283 * i / 7) * r * s * girth)) for i in range(7)])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(7):
            f = bm.faces.new((r0[i], r0[(i + 1) % 7], r1[(i + 1) % 7], r1[i]))
            f.material_index = m_bark
            f.smooth = True
    f = bm.faces.new(list(reversed(rings[0])))
    f.material_index = m_bark
    f = bm.faces.new(rings[-1])
    f.material_index = m_bark
    # the tiers of boughs, the widest lowest: a ragged skirt whose tips droop
    for k in range(n):
        t = k / (n - 1)
        R = K["r0"] * s * girth * (1 - K["taper"] * t) * rng.uniform(0.92, 1.08)
        rim_y = rims[k]
        apex_y = top if k == n - 1 else rims[k + 1] + 0.3 * s
        tips = rng.choice((6, 7, 8)) if k < n - 1 else 5
        turn = a0 + rng.random() * 6.283
        cx, cz = at(rim_y)
        ax, az = at(apex_y)
        rim, mid = [], []
        for i in range(2 * tips):
            a = turn + 6.283 * i / (2 * tips)
            tip = i % 2 == 0
            r = R * (rng.uniform(0.94, 1.08) if tip else rng.uniform(0.68, 0.78))
            dy = -K["droop"] * s * rng.uniform(0.6, 1.3) if tip else 0.05 * s
            rim.append(bm.verts.new(W(cx + math.cos(a) * r, y + rim_y + dy, cz + math.sin(a) * r)))
            rm = R * 0.5 * rng.uniform(0.92, 1.08)
            mx, mz = (cx + ax) / 2, (cz + az) / 2
            mid.append(bm.verts.new(W(mx + math.cos(a) * rm, y + rim_y + (apex_y - rim_y) * 0.4, mz + math.sin(a) * rm)))
        apex = bm.verts.new(W(ax, y + apex_y, az))
        under = bm.verts.new(W(cx, y + rim_y + 0.16 * s, cz))
        m = m_needles[min(len(m_needles) - 1, int(t * len(m_needles) * 0.999))]
        for i in range(2 * tips):
            j = (i + 1) % (2 * tips)
            for face in ((rim[i], rim[j], mid[j], mid[i]), (mid[i], mid[j], apex), (rim[j], rim[i], under)):
                f = bm.faces.new(face)
                f.material_index = m
                f.smooth = False
    return top


def snag(bm, x, z, h, rng, m_bark, m_cut=None, y=0.0):
    """A dead standing tree: a bare trunk broken off at `h`, leaning a little, a few branch stubs."""
    la = rng.random() * 6.283
    lx, lz = math.cos(la) * 0.12 * h, math.sin(la) * 0.12 * h
    rings = []
    for u, r in ((-0.03, 0.2), (0.12, 0.14), (0.6, 0.11), (1.0, 0.075)):
        hh = max(0.0, u) * h
        rings.append([bm.verts.new(W(x + lx * u * u + math.cos(6.283 * i / 7) * r, y + u * h + (0.12 * rng.random() if u == 1.0 else 0.0), z + lz * u * u + math.sin(6.283 * i / 7) * r)) for i in range(7)])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(7):
            f = bm.faces.new((r0[i], r0[(i + 1) % 7], r1[(i + 1) % 7], r1[i]))
            f.material_index = m_bark
            f.smooth = True
    f = bm.faces.new(rings[-1])
    f.material_index = m_bark if m_cut is None else m_cut
    for _ in range(rng.randint(3, 5)):
        u = rng.uniform(0.35, 0.9)
        a = rng.random() * 6.283
        bx, bz = x + lx * u * u, z + lz * u * u
        ln = rng.uniform(0.25, 0.6)
        tip = W(bx + math.cos(a) * ln, y + u * h + ln * 0.45, bz + math.sin(a) * ln)
        base = [bm.verts.new(W(bx + math.cos(a) * 0.06 + math.cos(a + 1.57) * 0.035 * q, y + u * h + 0.035 * p, bz + math.sin(a) * 0.06 + math.sin(a + 1.57) * 0.035 * q)) for p, q in ((-1, 0), (0.6, 1), (0.6, -1))]
        tv = bm.verts.new(tip)
        for i in range(3):
            f = bm.faces.new((base[i], base[(i + 1) % 3], tv))
            f.material_index = m_bark


def _smooth(e0, e1, v):
    t = max(0.0, min(1.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


class Shade:
    """What lies on the ground under things, read by a builder's ground paint. `cast` a crown's
    shade or a thing's contact shadow; `at` the darkness (0 to about 0.6) and the litter (0 to 1) at
    a point. The game's key light stands high in the west-south-west (WorldScene: (-14, 24, 10)), so a
    shade lies a little to the east-north-east of what casts it."""

    CELL = 2.5

    def __init__(self):
        self.cells = {}

    def cast(self, x, z, r, dark, litter=0.0, kind="needles", throw=0.22):
        ox, oz = x + r * throw * 1.2, z - r * throw * 0.85
        item = (ox, oz, x, z, r, dark, litter, kind)
        c = self.CELL
        for i in range(int(math.floor((x - r) / c)), int(math.floor((ox + r) / c)) + 1):
            for k in range(int(math.floor((oz - r) / c)), int(math.floor((z + r) / c)) + 1):
                self.cells.setdefault((i, k), []).append(item)

    def at(self, x, z):
        light = 1.0
        litter = {}
        c = self.CELL
        for ox, oz, cx, cz, r, dark, lit, kind in self.cells.get((int(math.floor(x / c)), int(math.floor(z / c))), ()):
            d = math.hypot(x - ox, z - oz)
            if d < r:
                light *= 1 - dark * _smooth(r, r * 0.3, d)
            if lit > 0:
                d2 = math.hypot(x - cx, z - cz)
                if d2 < r * 0.95:
                    litter[kind] = max(litter.get(kind, 0.0), lit * _smooth(r * 0.95, r * 0.25, d2))
        return min(0.62, 1 - light), litter


def worn(d):
    """How worn the ground is `d` metres outside a footpath's tread (negative: on it), 0..1: one
    smooth ease from bare earth just inside the tread's edge to untouched grass 0.6 m beyond it. No
    line, no step, no noise: the grass thins toward the middle the way it does where feet pass
    every day."""
    t = max(0.0, min(1.0, (d + 0.14) / 0.74))
    return 1 - t * t * (3 - 2 * t)


def refine_near(bm, faces, wear, lo=0.04, hi=0.97):
    """Cuts the ground finer where the wear changes (a footpath's edges): every face among `faces`
    with a corner whose wear is between `lo` and `hi`, or whose corners differ, has its edges
    halved (its neighbours are cut to match: no T-junctions). `wear`: (x, z) in game axes to 0..1.
    A new vertex lies on the edge it halves, so the ground's shape is unchanged."""
    import bmesh
    cache = {}

    def at(v):
        key = (round(v.co.x, 4), round(v.co.y, 4))
        if key not in cache:
            cache[key] = wear(v.co.x, -v.co.y)
        return cache[key]

    edges = set()
    for f in faces:
        ws = [at(v) for v in f.verts]
        if any(lo < w < hi for w in ws) or max(ws) - min(ws) > 0.2:
            edges.update(f.edges)
    if edges:
        bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
    return len(edges)


def clumps(rng, n, spots, spread=1.0, each=(2, 4)):
    """`n` places in clusters round a few of `spots` ((x, z) or (x, z, weight)): dense groups, bare
    ground between (never an even scatter). Yields (x, z, rank): rank 0 the group's first and largest."""
    out = []
    k = 0
    while len(out) < n and k < 400:
        k += 1
        sx, sz = rng.choice(spots)[:2]
        for q in range(rng.randint(*each)):
            a, d = rng.random() * 6.283, spread * (0.25 + 0.75 * math.sqrt(rng.random())) * (0.0 if q == 0 else 1.0)
            out.append((sx + math.cos(a) * d, sz + math.sin(a) * d, q))
            if len(out) >= n:
                break
    return out
