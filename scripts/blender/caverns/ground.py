"""The ground as the game walks it (`Ground`: the terrain grid from scripts/blender/data/
caverns_terrain.json), the water's distance, each zone's ground painted into its vertex colours
(`zone_ground`, `terrain_colour`) and the floor itself, the walk collider (`build_terrain`)."""

import math
from .kit import C, fbm, GEO_STATS, lin, mixc, SKIRT_Y, smooth


# ---------------------------------------------------------------------------------------------
# the ground as the game walks it


class Ground:
    """The walk grid (shared/worlds/caverns.ts: TERRAIN_HEIGHTS, cavernsFloorY, the mask), as read."""

    def __init__(self, T):
        self.n, self.cell, self.x0 = T["n"], T["cell"], T["x0"]
        self.h, self.s = T["heights"], T["surface"]
        # (under a trail, the ground it is cut into)
        self.g = T.get("ground", T["surface"])
        self.mn, self.mc, self.m = T["maskN"], T["maskCell"], T["mask"]
        self.pools = T["pools"]
        # (the stream as the game runs it, and its falls: docs/caverns-roadmap.md R3.3)
        self.stream = T.get("stream", [])
        self.falls = T.get("falls", [])
        # (the ground no one reaches: docs/caverns-roadmap.md R4.1)
        self.unreached = T.get("unreached", [])

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


def zone_ground(L, s, x, y, z, base):
    """Each zone's ground detail over its flat colour: the jungle's moss and leaf litter, the basecamp's
    trodden ways, the breakdown's gravel and dust, the mudflats' dark cracks (the plates lie on them),
    the overlook's flowstone round the Hound's Hand, the terraces' rimstone ripples, the rift's faint
    glints."""
    n1 = fbm(x * 0.35, 0.3, z * 0.35, 11)
    n2 = fbm(x * 0.8, 1.7, z * 0.8, 13)
    c = base
    if s == SURF["jungle"]:
        c = mixc(c, "mossLight", smooth(0.1, 0.55, n1) * 0.55)
        c = mixc(c, "mossDeep", smooth(0.2, 0.6, -n1) * 0.55)
        c = mixc(c, "leafLitter", smooth(0.15, 0.55, n2) * 0.7)
        # (bare limestone breaking through the moss here and there)
        c = mixc(c, "limestoneDark", smooth(0.35, 0.6, -n2) * 0.5)
        Rv = L["river"]
        wet = min(polyline_distance(x, z, Rv["segments"][0]), math.hypot(x - Rv["plunge"]["x"], z - Rv["plunge"]["z"]) - Rv["plunge"]["r"])
        c = mixc(c, "soilDark", smooth(1.6, 0.3, wet) * 0.6)
    elif s == SURF["basecamp"]:
        ways = [((0.0, -21.2), (0.0, -18.0)), ((0.0, -18.0), (-4.7, -14.8)), ((0.0, -18.0), (6.8, -19.6)), ((0.0, -18.0), (-3.0, -14.0))]
        d = min(polyline_distance(x, z, [a, b]) for a, b in ways)
        c = mixc(c, "campSoil", smooth(0.2, 0.6, n2) * 0.45)
        c = mixc(c, "campTrodden", smooth(1.6, 0.4, d) * 0.7)
    elif s == SURF["breakdown"]:
        c = mixc(c, "gravelDark", smooth(0.15, 0.55, n2) * 0.5)
        c = mixc(c, "gravelLight", smooth(0.2, 0.6, -n2) * 0.45)
        c = mixc(c, "groundOverlook", smooth(0.3, 0.7, n1) * 0.3)
    elif s == SURF["mudflats"]:
        c = mixc("mudCrack", "groundMud", 0.3 + 0.3 * (0.5 + 0.5 * n1))
    elif s == SURF["overlook"]:
        # (no slab joints painted in: a line finer than the floor's 0.5 m grid only smears into a
        # smudge; the overlook's slabs are geometry)
        # (the camp's ground trodden pale round its hearth)
        Tw = L["hearth"]
        c = mixc(c, "flowstone", smooth(3.6, 1.0, math.hypot(x - Tw["x"], z - Tw["z"])) * 0.35)
        c = mixc(c, "limestoneLight", smooth(0.2, 0.6, n1) * 0.12)
    elif s == SURF["travertine"]:
        ripple = 0.5 + 0.5 * math.sin((x * 0.6 + z) * 5.2 + 3.0 * n1)
        c = mixc(c, "travRockDark", ripple * 0.28)
    elif s == SURF["rift"]:
        c = mixc(c, "riftGlint", smooth(0.2, 0.6, n2) * 0.6)
    elif s == SURF["shore"]:
        c = mixc(c, "sedimentDry", smooth(0.2, 0.6, n1) * 0.35)
    return c


def terrain_colour(L, G, i, k, wd):
    """A floor vertex's colour: its zone's ground (a little mottled), the lake's bed by its depth, the
    shore wet where the water laps. A trail's vertex is the ground it is cut into: the game draws the
    trodden way over it, its edges crisp at any zoom (client/src/scene/caveSurface.ts)."""
    n = G.n
    q = k * n + i
    x, z = G.at(i, k)
    y = G.h[q]
    s = G.g[q]
    if s == SURF["bed"]:
        depth = L["lake"]["water"] - y
        c = mixc("sedimentWet", "bedShallow", smooth(0.02, 0.3, depth))
        c = mixc(c, "bedMid", smooth(0.3, 0.8, depth))
        return mixc(c, "bedDeep", smooth(0.8, 1.5, depth))
    base = lin(C[SURF_COLOUR.get(s, "groundShore")])
    k1 = 0.92 + 0.14 * (0.5 + 0.5 * fbm(x * 0.45, 0.3, z * 0.45, 11))
    c = (base[0] * k1, base[1] * k1, base[2] * k1)
    c = zone_ground(L, s, x, y, z, c)
    if s == SURF["shore"]:
        c = mixc(c, "sedimentWet", smooth(0.9, 0.0, wd) * 0.8)
    # (no slope painted in here: a band the 0.5 m grid carries only smears into smoke; the game paints
    # the banks too steep to walk as bare rock triangle by triangle, CavernsWorld's floorBanks)
    return c


def build_terrain(G, L, floor):
    """The cavern's floor: a subdivided grid (a vertex every 0.5 m over the whole 45 x 45 m) displaced
    to the walk grid, so it IS the click collider (cavernsFloorY, triangle for triangle); its four edges
    carried down to -2.5 m (the pedestal's skirt, closing the box)."""
    n = G.n
    wd = water_distance(G, L)
    cols = []
    counts = {}
    for k in range(n):
        for i in range(n):
            q = k * n + i
            counts[G.s[q]] = counts.get(G.s[q], 0) + 1
            cols.append(terrain_colour(L, G, i, k, wd[q]))
    names = {v: k for k, v in SURF.items()}
    GEO_STATS["floorMix"] = {names.get(s, str(s)): round(100 * c / (n * n), 1) for s, c in sorted(counts.items())}
    # (the lightest blur over the neighbours: the zones' seams lose the grid's corners but stay crisp,
    # a colour changing within a cell or two; the game's surface detail breaks them up further)
    soft = []
    for k in range(n):
        for i in range(n):
            acc, wsum = [0.0, 0.0, 0.0], 0.0
            for dk in (-1, 0, 1):
                for di in (-1, 0, 1):
                    ii, kk = i + di, k + dk
                    if 0 <= ii < n and 0 <= kk < n:
                        w = 12.0 if di == 0 and dk == 0 else (1.0 if di == 0 or dk == 0 else 0.5)
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



def near_polyline(x, z, pts):
    return polyline_distance(x, z, [(p[0], p[1]) for p in pts])



def free_spot(G, L, x, z, clear=1.0):
    """Whether (x, z) is open walkable ground clear of the nodes, the trails, the stream and the
    props (for walked-through dressing that must never sit on anything)."""
    if not G.walk(x, z):
        return False
    for nd in L["nodes"]:
        if math.hypot(x - nd["x"], z - nd["z"]) < clear + 0.6:
            return False
    for p in L["paths"]:
        if near_polyline(x, z, p["points"]) < p["half"] + 0.3:
            return False
    Rv = L["river"]
    if any(near_polyline(x, z, seg) < Rv["half"] + 0.4 for seg in Rv["segments"]):
        return False
    for tx, tz, *_ in L["trees"] + L["slabs"] + L["stubs"] + L["boulders"]:
        if math.hypot(x - tx, z - tz) < clear:
            return False
    return True
