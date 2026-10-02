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


BUSHES = {
    # each lump: across, up, along, half-width, half-height (all times the bush's size)
    "round": ((0.0, 0.34, 0.0, 0.44, 0.4), (0.3, 0.25, 0.14, 0.32, 0.29), (-0.26, 0.23, 0.18, 0.29, 0.26)),
    "tall": ((0.0, 0.4, 0.0, 0.36, 0.42), (0.22, 0.3, 0.12, 0.3, 0.32), (-0.2, 0.33, 0.14, 0.28, 0.35), (0.02, 0.8, -0.04, 0.27, 0.3), (-0.13, 0.62, -0.17, 0.22, 0.25)),
    "spread": ((0.0, 0.13, 0.0, 0.5, 0.16), (0.42, 0.1, 0.18, 0.36, 0.13), (-0.38, 0.11, 0.22, 0.34, 0.14), (0.1, 0.1, -0.4, 0.32, 0.13)),
}


def bush(bm, blob, x, z, s, rng, kind, m_leaf, m_leaf2=None, dots=None):
    """A bush at the game point (x, z), `s` its size: `kind` "round" (a waist-high mound), "tall" (a
    head-high leafy shrub) or "spread" (a low mat, walked over). Turned its own way, its lumps in
    one green or two. `dots`: (nub, material, count, size) for berries or blossom on it. `blob` is
    the builder's own."""
    a0 = rng.random() * 6.283
    c, sn = math.cos(a0), math.sin(a0)
    lumps = BUSHES[kind]
    for i, (dx, y, dz, r, h) in enumerate(lumps):
        rx, rz = dx * c - dz * sn, dx * sn + dz * c
        j = rng.uniform(0.9, 1.1)
        blob(bm, x + rx * s, y * s, z + rz * s, r * s * j, h * s * j, r * 0.94 * s * j, m=m_leaf2 if (m_leaf2 is not None and i % 2) else m_leaf, cuts=2 if (kind == "spread" or r <= 0.3) else 3, noise=0.11, rng=rng, flat_bottom=-0.05)
    if dots:
        nub, mat, count, size = dots
        top = max(l[1] + l[4] for l in lumps)
        for _ in range(count):
            a = rng.random() * 6.283
            rr = rng.uniform(0.2, 0.42) * s
            nub(x + math.cos(a) * rr, rng.uniform(0.35, 0.92) * top * s, z + math.sin(a) * rr, size, size * 1.5, mat)


def grass_clump(bm, x, z, rng, m, h=0.4, blades=7, spread=0.09):
    """A clump of tall grass: blades leaning out from one root, each bent once (its material is
    double-sided)."""
    for _ in range(blades):
        a = rng.random() * 6.283
        bh = h * rng.uniform(0.55, 1.0)
        d = spread * rng.random()
        bx, bz = x + math.cos(a) * d, z + math.sin(a) * d
        lean = rng.uniform(0.1, 0.36) * bh
        sx, sz = -math.sin(a) * 0.02, math.cos(a) * 0.02
        mx, mz = bx + math.cos(a) * lean * 0.35, bz + math.sin(a) * lean * 0.35
        vs = [bm.verts.new(W(bx - sx, -0.02, bz - sz)), bm.verts.new(W(bx + sx, -0.02, bz + sz)),
              bm.verts.new(W(mx + sx * 0.7, bh * 0.55, mz + sz * 0.7)), bm.verts.new(W(mx - sx * 0.7, bh * 0.55, mz - sz * 0.7)),
              bm.verts.new(W(bx + math.cos(a) * lean, bh, bz + math.sin(a) * lean))]
        for face in ((0, 1, 2, 3), (3, 2, 4)):
            bm.faces.new([vs[i] for i in face]).material_index = m


def reeds(bm, x, z, rng, m_stalk, m_head, y0=0.0, n=3):
    """A stand of cattails at the water's edge: thin stalks (two crossed blades each) with a brown
    head near the top (both materials double-sided)."""
    for _ in range(n):
        rx, rz = x + rng.uniform(-0.12, 0.12), z + rng.uniform(-0.12, 0.12)
        h = rng.uniform(0.55, 0.95)
        a = rng.random() * 6.283
        lx, lz = rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)
        for q in (0.0, 1.571):
            sx, sz = math.cos(a + q) * 0.012, math.sin(a + q) * 0.012
            vs = [bm.verts.new(W(rx - sx, y0 - 0.2, rz - sz)), bm.verts.new(W(rx + sx, y0 - 0.2, rz + sz)), bm.verts.new(W(rx + lx + sx * 0.6, y0 + h, rz + lz + sz * 0.6)), bm.verts.new(W(rx + lx - sx * 0.6, y0 + h, rz + lz - sz * 0.6))]
            bm.faces.new(vs).material_index = m_stalk
            hx, hz = math.cos(a + q) * 0.03, math.sin(a + q) * 0.03
            u0, u1 = (h - 0.22) / h, (h - 0.05) / h
            hv = [bm.verts.new(W(rx + lx * u0 - hx, y0 + h - 0.22, rz + lz * u0 - hz)), bm.verts.new(W(rx + lx * u0 + hx, y0 + h - 0.22, rz + lz * u0 + hz)),
                  bm.verts.new(W(rx + lx * u1 + hx, y0 + h - 0.05, rz + lz * u1 + hz)), bm.verts.new(W(rx + lx * u1 - hx, y0 + h - 0.05, rz + lz * u1 - hz))]
            bm.faces.new(hv).material_index = m_head


def frog(blob):
    """A frog sitting at the origin, facing +z: [(role, build(bm, material index))], the roles "body",
    "dark" (its legs), "belly", "eye" and "pupil" (a builder paints each its own way). `blob`: the
    builder's own."""
    parts = [
        ("body", (0.0, 0.036, 0.0, 0.05, 0.034, 0.066), 3),
        ("belly", (0.0, 0.021, 0.014, 0.043, 0.02, 0.054), 2),
        ("body", (0.0, 0.05, 0.052, 0.04, 0.028, 0.036), 2),
    ]
    for sx in (1, -1):
        parts += [
            ("dark", (sx * 0.052, 0.022, -0.03, 0.024, 0.022, 0.042), 2),
            ("dark", (sx * 0.036, 0.012, 0.05, 0.012, 0.012, 0.02), 1),
            ("eye", (sx * 0.024, 0.076, 0.058, 0.015, 0.015, 0.015), 2),
            ("pupil", (sx * 0.027, 0.079, 0.069, 0.007, 0.008, 0.006), 1),
        ]
    return [(role, (lambda bm, m, a=a, c=c: blob(bm, *a, m=m, cuts=c))) for role, a, c in parts]


def lily_pad(bm, slab, x, z, r, y, m, turn=0.0):
    """A lily pad floating at (x, z): a round leaf with a notch cut to its middle. `slab`: the
    builder's own."""
    rim = [(x + r * math.cos(a), z + r * math.sin(a)) for a in (turn + 0.35 + (2 * math.pi - 0.7) * k / 14 for k in range(15))] + [(x, z)]
    slab(bm, rim, y + 0.004, y + 0.02, m=m)


def worn(d):
    """How worn the ground is `d` metres outside a footpath's tread (negative: on it), 0..1: one
    smooth ease from bare earth just inside the tread's edge to untouched grass 0.6 m beyond it. No
    line, no step, no noise: the grass thins toward the middle the way it does where feet pass
    every day."""
    t = max(0.0, min(1.0, (d + 0.14) / 0.74))
    return 1 - t * t * (3 - 2 * t)


def blot(x, z, cx, cz, r, vnoise, squash=None, lobes=1.0):
    """How far (x, z) is outside a worn patch round (cx, cz), about `r` across (negative: on it),
    to hand to `worn`. Never a disc: an oval at its own angle (each patch its own, from where it
    lies), its outline in a few slow lobes, the whole pushed about by the ground's own noise. All
    low frequencies: the outline is uneven, never ragged."""
    h = math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453
    h -= math.floor(h)
    g = math.sin(cx * 39.346 + cz * 11.135) * 24634.6345
    g -= math.floor(g)
    th = h * math.pi
    c, s = math.cos(th), math.sin(th)
    dx, dz = x - cx, z - cz
    k = (0.6 + 0.25 * g) if squash is None else squash
    u, v = dx * c + dz * s, (-dx * s + dz * c) / k
    a = math.atan2(v, u)
    edge = 1 + lobes * (0.2 * math.sin(2 * a + h * 17.0) + 0.14 * math.sin(3 * a + g * 31.0) + 0.08 * math.sin(5 * a + h * 53.0))
    push = 0.5 * (vnoise(x * 0.8 + cx, z * 0.8 + cz) - 0.5) + 0.22 * (vnoise(x * 1.9 - cz, z * 1.9 + cx) - 0.5)
    return math.hypot(u, v) - 0.5 * r * edge + push * min(1.0, r / 1.2)


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
