"""The water: the Great Lake, the terraces' warm pools (each rimstone basin its own size and turn:
`pool_wobble`), the stream from the jungle's waterfall down to the lake, its fords, and the outflow
over the rim (`build_waters`)."""

import math
from .ground import inside_poly, lake_factor
from .kit import blob, box, fan, GEO_STATS, mixc, smooth
from .walls import wall_point


# ---------------------------------------------------------------------------------------------
# the water: the Great Lake, the terraces' warm pools, the stream from the jungle's waterfall down
# through the mudflats and the pools into the lake, and its outflow east over the rim


def pool_wobble(i, a):
    """caverns.ts `poolWobble`: a pool's rim in and out round it (a rimstone basin's scallops)."""
    return 1 + 0.07 * math.sin(3 * a + 1.3 * i + 0.4) + 0.045 * math.sin(5 * a + 2.1 * i + 1.1)


def pool_outline(L, p, grow=0.0, segs=40):
    """A warm pool's outline (shared/worlds/caverns.ts poolDistance at `grow`): its turned, scalloped
    ellipse, round from above."""
    i = L["terraces"]["pools"].index(p)
    k = 1 + grow / min(p["rx"], p["rz"])
    c, sn = math.cos(p["rot"]), math.sin(p["rot"])
    out = []
    for j in range(segs):
        a = 2 * math.pi * j / segs
        w = pool_wobble(i, a) * k
        u, v = p["rx"] * w * math.cos(a), p["rz"] * w * math.sin(a)
        out.append((p["x"] + u * c - v * sn, p["z"] + u * sn + v * c))
    return (p["x"], p["z"]), out


def pool_y_at(L, x, z):
    """The water's height in the pool nearest (x, z)."""
    pools = L["terraces"]["pools"]
    return min(pools, key=lambda p: math.hypot((x - p["x"]) / p["rx"], (z - p["z"]) / p["rz"]))["y"]


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
            water.setv(v, mixc(mixc("lakeShallow", "lakeMid", smooth(0.05, 0.45, d)), "waterDark", smooth(0.5, 1.4, d)))
            wv[(i, k)] = v
        return wv[(i, k)]

    for k in range(n - 1):
        for i in range(n - 1):
            hs = [G.h[kk * n + ii] for ii, kk in ((i, k), (i + 1, k), (i, k + 1), (i + 1, k + 1))]
            x, z = G.at(i, k)
            if min(hs) > wy - 0.02 or lake_factor(L, x, z) > 1.45:
                continue
            # (never over the open edges' fall into the dark, outside the lake)
            if min(hs) < -1.0 and lake_factor(L, x, z) > 1.0:
                continue
            water.setsmooth(water.facing([wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)], "aqua", (0.0, 1.0, 0.0)))
    # the terraces' warm pools, each with its seats' submerged ledges, and the overflow from one down
    # over the dam into the next
    T = L["terraces"]
    for p in T["pools"]:
        centre, ring = pool_outline(L, p, grow=0.05)
        fan(therm, centre, ring, p["y"], "thermalWater")
    for s in L["thermalSeats"]:
        top = pool_y_at(L, s["x"], s["z"]) + ledge_top
        box(rock, s["x"] - 0.28, s["x"] + 0.28, top - 0.5, top, s["z"] - 0.28, s["z"] + 0.28, "travRockDark", top="travRock")
    pools = T["pools"]
    # (each pool spilling over its brim down to the next: from its rim nearest the next pool to that
    # pool's rim nearest it)
    for a, b in zip(pools, pools[1:]):
        _, ra = pool_outline(L, a, grow=-0.1)
        _, rb = pool_outline(L, b, grow=-0.1)
        pa = min(ra, key=lambda q: math.hypot(q[0] - b["x"], q[1] - b["z"]))
        pb = min(rb, key=lambda q: math.hypot(q[0] - pa[0], q[1] - pa[1]))
        dx, dz = pb[0] - pa[0], pb[1] - pa[1]
        ln = math.hypot(dx, dz) or 1.0
        sx, sz = -dz / ln * 0.45, dx / ln * 0.45
        q = [therm.v(pa[0] - sx, a["y"], pa[1] - sz), therm.v(pa[0] + sx, a["y"], pa[1] + sz), therm.v(pb[0] + sx, b["y"], pb[1] + sz), therm.v(pb[0] - sx, b["y"], pb[1] - sz)]
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
            wc = mixc("aqua", "waterDark", 0.35)
            if -22.0 < x < -8.0 and -12.6 < z < 1.8:
                wc = mixc(wc, "mudWater", 0.55)
            for v in (l, r):
                water.setv(v, mixc(wc, "foam", fall))
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
    cols = 6
    for j in range(11):
        t = j / 10
        y = top_y + (py - top_y) * t
        z = fz + 0.6 + (Pp["z"] - Pp["r"] * 0.3 - fz - 0.6) * t ** 3
        row = []
        for c in range(cols + 1):
            w = c / cols
            x = fx + (-0.5 - 0.2 * t) + (1.0 + 0.4 * t) * w
            v = water.v(x, y, z + 0.06 * math.sin(c * 2.1 + j))
            # (white streaks down it, foaming white at its lip and its foot)
            streak = 0.5 + 0.5 * math.sin(c * 2.7 + 1.1)
            water.setv(v, mixc(mixc("aquaShallow", "foam", 0.35 + 0.5 * streak), "foam", max(smooth(0.2, 0.0, t), smooth(0.75, 1.0, t))))
            row.append(v)
        if prev:
            for c in range(cols):
                water.setsmooth(water.facing((prev[c], prev[c + 1], row[c + 1], row[c]), "aquaShallow", (0.0, 0.3, 1.0)))
        prev = row
    # (the foam where it lands: a ring round its foot, broken)
    fcx, fcz = fx, Pp["z"] - Pp["r"] * 0.3
    for k in range(14):
        a = 2 * math.pi * k / 14
        rr = 0.55 + 0.35 * abs(math.sin(k * 1.9))
        blob(water, fcx + math.cos(a) * rr, py + 0.02, fcz + math.sin(a) * rr * 0.8, 0.22 + 0.1 * abs(math.sin(k)), 0.05, 0.18, "foam", cuts=0)
