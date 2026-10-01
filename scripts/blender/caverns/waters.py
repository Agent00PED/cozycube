"""The water: the Great Lake, the terraces' warm pools (each rimstone basin its own size and turn:
`pool_wobble`), the stream from the jungle's waterfall down to the lake, its fords, and the outflow
over the rim (`build_waters`)."""

import math
from .ground import inside_poly, lake_factor, near_polyline
from .kit import angular, blob, box, fan, GEO_STATS, mixc, SKIRT_Y, smooth
from .walls import wall_point


# ---------------------------------------------------------------------------------------------
# the water: the Great Lake, the terraces' warm pools, the stream from the jungle's waterfall down
# through the mudflats and the pools into the lake, and its outflow east over the rim


def foam_disc(water, cx, cz, y, r, base, rng, squash=0.85, n_ang=22, n_rad=5, hot=(0.0, 0.0), strength=1.0, G=None, keep=0.0, wobble=True):
    """Churned water where a fall strikes it (docs/caverns-roadmap.md R5.2): a disc of the water's own
    colour, white where the water lands (`hot`, an offset from the middle) and fading out to its edge in
    broken streaks, never white tiles floating on it. Given the ground (`G`), past `keep` metres from its
    middle it lies on the ground wherever that is lower: a film over the stones, never a slab."""
    centre = water.v(cx + hot[0], y, cz + hot[1])
    water.setv(centre, mixc(base, "foam", 0.85 * strength))
    rings = []
    for j in range(1, n_rad + 1):
        t = j / n_rad
        ring = []
        for k in range(n_ang):
            a = 2 * math.pi * k / n_ang
            wob = 1 + 0.12 * math.sin(3 * a + j) + 0.08 * math.sin(7 * a + 2 * j) if wobble else 1.0
            px = cx + hot[0] * (1 - t) + math.cos(a) * r * t * wob
            pz = cz + hot[1] * (1 - t) + math.sin(a) * r * t * wob * squash
            vy = y
            if G is not None and math.hypot(px - cx, pz - cz) > keep:
                vy = min(y, G.y(px, pz) + 0.025)
            v = water.v(px, vy, pz)
            streak = 0.5 + 0.5 * math.sin(5 * a + 3.1 * t + rng.random() * 0.8)
            white = (1 - smooth(0.0, 0.6, t)) * (0.55 + 0.45 * streak) * strength
            water.setv(v, mixc(base, "foam", 0.9 * white))
            ring.append(v)
        rings.append(ring)
    for k in range(n_ang):
        q = (k + 1) % n_ang
        water.setsmooth(water.facing((centre, rings[0][k], rings[0][q]), "aqua", (0.0, 1.0, 0.0)))
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n_ang):
            q = (k + 1) % n_ang
            water.setsmooth(water.facing((r0[k], r0[q], r1[q], r1[k]), "aqua", (0.0, 1.0, 0.0)))


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
            # (the lake's water, and up the stream's mouth wherever its channel is cut under the lake's
            # level: one sheet with the stream, no dry sliver between them; docs/caverns-roadmap.md R9.4)
            mouth = lake_factor(L, x, z) < 2.6 and any(near_polyline(x + G.cell / 2, z + G.cell / 2, seg) < L["river"]["half"] + 0.55 for seg in L["river"]["segments"])
            if min(hs) > wy - 0.02 or (lake_factor(L, x, z) > 1.45 and not mouth):
                continue
            # (never over the open edges' fall into the dark, outside the lake)
            if min(hs) < -1.0 and lake_factor(L, x, z) > 1.0:
                continue
            # (nor over the outflow's channel past the lake proper, where the ground falls to the rim:
            # never a shard of the lake's surface hanging over the dark)
            if lake_factor(L, x, z) > 1.08 and (min(hs) < -0.45 or x > L["half"] - 2.5):
                continue
            water.setsmooth(water.facing([wvert(i, k), wvert(i, k + 1), wvert(i + 1, k + 1), wvert(i + 1, k)], "aqua", (0.0, 1.0, 0.0)))
    # the terraces' warm pools, each with its seats' submerged ledges, and the overflow from one down
    # over the dam into the next
    T = L["terraces"]
    for p in T["pools"]:
        centre, ring = pool_outline(L, p, grow=0.05)
        fan(therm, centre, ring, p["y"], "thermalWater")
    # (each seat's submerged ledge a shelf of travertine grown out from the rim under the water, never
    # a block)
    for s in L["thermalSeats"]:
        top = pool_y_at(L, s["x"], s["z"]) + ledge_top
        blob(rock, s["x"], top - 0.11, s["z"], 0.36, 0.11, 0.32, "travRock", cuts=2)
    pools = T["pools"]
    # (each pool spilling out of its notch down the dam into the next: a thin sheet of water over a
    # curtain of flowstone, following the ground down, whiter where it runs steep)
    from .rims import pool_ends
    ends = pool_ends(G, L)
    for i, (a, b) in enumerate(zip(pools, pools[1:])):
        _, ra = pool_outline(L, a, grow=0.02, segs=56)
        _, rb = pool_outline(L, b, grow=0.02, segs=56)
        a_out = ends[i][1]
        pa = min(ra, key=lambda q: abs((math.atan2(q[1] - a["z"], q[0] - a["x"]) - a_out + math.pi) % (2 * math.pi) - math.pi))
        pb = min(rb, key=lambda q: math.hypot(q[0] - pa[0], q[1] - pa[1]))
        ln = math.hypot(pb[0] - pa[0], pb[1] - pa[1]) or 1.0
        tx, tz = (pb[0] - pa[0]) / ln, (pb[1] - pa[1]) / ln
        nx, nz = -tz, tx
        steps = max(4, int(ln / 0.15))
        prev_w = prev_f = None
        last_y = a["y"] + 0.006
        # (from 0.35 m inside the pool above to 0.35 m inside the next: under their water at both ends,
        # through the notches in their rims, docs/caverns-roadmap.md R8.5)
        lead = 0.35 / ln
        n_lead = max(2, int(0.35 / 0.15))
        for k in range(-n_lead, steps + n_lead + 1):
            t = k / steps if 0 <= k <= steps else (-lead * (-k) / n_lead if k < 0 else 1 + lead * (k - steps) / n_lead)
            # (a rivulet finds its own way: wandering, never ruled straight)
            # (in the groove the overflow cut: a little wander inside it, caverns.ts POOL_OVERFLOWS)
            wander = (0.1 * math.sin(t * ln * 0.9 + i * 1.3) + 0.05 * math.sin(t * ln * 2.3 + i)) * max(0.0, math.sin(min(1.0, max(0.0, t)) * math.pi)) ** 0.6
            x, z = pa[0] + (pb[0] - pa[0]) * t + nx * wander, pa[1] + (pb[1] - pa[1]) * t + nz * wander
            ground = G.y(x, z)
            if t <= 0:
                y = a["y"] + 0.006
            elif t >= 1:
                y = b["y"] + 0.006
            else:
                y = min(last_y, max(b["y"] + 0.006, ground + 0.03))
            steep = min(1.0, (last_y - y) / 0.12) if k > 0 else 0.0
            last_y = y
            hw_ = (0.09 + 0.05 * t + 0.07 * steep) * (1 + 0.35 * math.sin(k * 1.3 + i))
            # (its bed wet and dark under it and a hand either side, the travertine it has grown)
            fw = [rock.v(x + nx * sgn * (hw_ + 0.12), max(b["y"] - 0.02, ground + 0.012), z + nz * sgn * (hw_ + 0.12)) for sgn in (1, -1)]
            for v in fw:
                rock.setv(v, "travWet")
            ww = [therm.v(x + nx * hw_, y, z + nz * hw_), therm.v(x, y + 0.004, z), therm.v(x - nx * hw_, y, z - nz * hw_)]
            therm.setv(ww[0], mixc("aquaShallow", "foam", 0.3 * steep))
            therm.setv(ww[1], mixc("aquaShallow", "foam", 0.2 + 0.6 * steep))
            therm.setv(ww[2], mixc("aquaShallow", "foam", 0.3 * steep))
            if t <= 0 or t >= 1:
                # (under the pools' water: the pools' own colour, fading into them)
                for v in ww:
                    therm.setv(v, "thermalWater")
            if prev_w:
                therm.facing((prev_w[0], prev_w[1], ww[1], ww[0]), "aquaShallow", (0.0, 1.0, 0.0))
                therm.facing((prev_w[1], prev_w[2], ww[2], ww[1]), "aquaShallow", (0.0, 1.0, 0.0))
                if 0 < t < 1:
                    rock.setsmooth(rock.facing((prev_f[0], prev_f[1], fw[1], fw[0]), "travWet", (0.0, 1.0, 0.0)))
            prev_w, prev_f = ww, fw
    # the stream (docs/caverns-roadmap.md R3.3), drawn from the game's own profile of it
    # (cavernsTerrainData's `stream`: every 0.3 m its surface, only ever falling, its width breathing,
    # and whether it runs, riffles or falls there): three strips across, the middle a paler thread of
    # current, white water over the riffles with stones breaking it; where it falls, a curtain off the
    # lip into a splash at its foot; stepping stones across each ford; never over the lake's water, a
    # pool or the plunge pool
    Rv = L["river"]
    Pp = Rv["plunge"]
    hw = Rv["half"] * 0.92
    PLUNGE_R = Pp["r"] - 0.05
    # (each warm pool's surface edge, as its water is drawn: the stream ends on it exactly)
    POOL_EDGES = [pool_outline(L, p_, grow=0.05)[1] for p_ in L["terraces"]["pools"]]
    rng = __import__("random").Random(43)

    def skip(x, z):
        if lake_factor(L, x, z) < 1.03 or math.hypot(x - Pp["x"], z - Pp["z"]) < PLUNGE_R:
            return True
        # (past the map's edge the rim's own fall takes the outflow on: build_rim)
        if abs(x) > L["half"] - 0.15 or abs(z) > L["half"] - 0.15:
            return True
        # (its mouth, cut under the lake's level, runs on over the lake's own water at its level: one
        # sheet, docs/caverns-roadmap.md R9.4)
        return any(inside_poly(x, z, POOL_EDGES[k]) for k in range(len(pools)))

    def in_basin(x, z):
        # (the water a sample lies in, a pool or the plunge pool: its own level, or None)
        if math.hypot(x - Pp["x"], z - Pp["z"]) < Pp["r"] + 0.05:
            return py
        for p in pools:
            if inside_poly(x, z, pool_outline(L, p, grow=0.15)[1]):
                return p["y"]
        return None

    rim_ = min(G.y(Pp["x"] + math.cos(a) * (Pp["r"] + 0.3), Pp["z"] + math.sin(a) * (Pp["r"] + 0.3)) for a in (k * 0.4 for k in range(16)))
    py = Pp.get("level", rim_ - 0.15)

    falls = [dict(f) for f in G.falls]
    absorb = []
    for f in falls:
        tx, tz = f["tx"], f["tz"]
        for p_ in pools:
            _, ol = pool_outline(L, p_, grow=-0.3)
            for k in range(1, 16):
                qx, qz = f["x1"] + tx * 0.1 * k, f["z1"] + tz * 0.1 * k
                if inside_poly(qx, qz, ol):
                    f["pool"] = True
                    break
            if f.get("pool"):
                break

    def absorbed(x, z):
        for ax, az, bx, bz in absorb:
            dx, dz = bx - ax, bz - az
            ln2 = dx * dx + dz * dz or 1.0
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / ln2))
            if math.hypot(x - ax - dx * t, z - az - dz * t) < 0.3:
                return True
        return False

    ribbons = 0
    stones = 0
    def rows_of(raw):
        # (docs/caverns-roadmap.md R10.3: each fall resampled as an arc off its lip, flat leaving it and
        # steepening as it drops, so it hangs clear in front of the cliff it falls down, never sliding
        # down the slope like the ground; and wherever the strip leaves or meets a basin (a pool, the
        # plunge pool, the lake), a row set exactly on its boundary: no gap between the two sheets)
        out = []
        i = 0
        while i < len(raw):
            q = raw[i]
            if q[6] == 2:
                j = i
                while j + 1 < len(raw) and raw[j + 1][6] == 2:
                    j += 1
                lip = raw[i]
                foot = raw[min(len(raw) - 1, j + 1)]
                drop = lip[2] - foot[2]
                n_ = max(6, int(10 * min(1.0, drop / 1.2)) + 4)
                for k in range(n_):
                    t = k / n_
                    out.append((lip[0] + (foot[0] - lip[0]) * t, lip[1] + (foot[1] - lip[1]) * t, lip[2] - drop * t * t, lip[3] + (foot[3] - lip[3]) * t, lip[4], lip[5], 2))
                i = j + 1
                continue
            out.append(q)
            i += 1
        rows = []
        for k, q in enumerate(out):
            if k > 0 and skip(q[0], q[1]) != skip(out[k - 1][0], out[k - 1][1]):
                a, b = out[k - 1], q
                inside_a = skip(a[0], a[1])
                lo, hi = 0.0, 1.0
                for _ in range(10):
                    mid_ = (lo + hi) / 2
                    if skip(a[0] + (b[0] - a[0]) * mid_, a[1] + (b[1] - a[1]) * mid_) == inside_a:
                        lo = mid_
                    else:
                        hi = mid_
                tb = hi if inside_a else lo
                drawn = b if inside_a else a
                bx_, bz_ = a[0] + (b[0] - a[0]) * tb, a[1] + (b[1] - a[1]) * tb
                if not skip(bx_, bz_):
                    rows.append((bx_, bz_, drawn[2], drawn[3], drawn[4], drawn[5], 3))
            rows.append(q)
        return rows

    for raw in G.stream:
        reach = rows_of(raw)
        prev = None
        last = None
        since_stone = 0.0
        for idx, (x, z, y, w, tx, tz, kind) in enumerate(reach):
            if skip(x, z):
                prev = None
                continue
            # (a sample just past a fall's foot starts afresh: the curtain lands there)
            half_w = hw * w * (0.85 if kind == 2 else 1.0)
            near_pool = any(inside_poly(x, z, pool_outline(L, p_, grow=1.0)[1]) for p_ in pools)
            for back in range(1, 6):
                if near_pool:
                    break
                if idx - back >= 0 and reach[idx - back][6] == 2 and kind != 2:
                    half_w *= 1.0 + 0.55 * math.sin(math.pi * min(1.0, back / 5.0)) ** 0.7
                    break
            basin = in_basin(x, z)
            if basin is not None:
                y = max(y, basin + 0.006)
            nx, nz = -tz, tx
            fall = kind == 2
            wc = mixc("aqua", "waterDark", 0.35)
            if -22.0 < x < -8.0 and -12.6 < z < 1.8:
                wc = mixc(wc, "mudWater", 0.55)
            if basin is not None:
                wc = "thermalWater" if basin != py else mixc("aqua", "waterDark", 0.25)
            white = 0.55 if kind == 1 else (0.5 + 0.3 * math.sin(idx * 1.7) if fall else 0.0)
            # (after a fall, the water churned white for a metre)
            for back in range(1, 5):
                if idx - back >= 0 and reach[idx - back][6] == 2:
                    white = max(white, 0.8 - 0.18 * back)
            edge = mixc(wc, "foam", white * 0.6)
            mid = mixc(mixc(wc, "aquaShallow", 0.28), "foam", white)
            if basin is not None:
                edge = mid = wc
            elif lake_factor(L, x, z) < 1.45 and G.y(x, z) < K["water"] - 0.02:
                y = max(y, K["water"] + 0.004)
                # (the lake's own colour over the same depth, as its surface paints it: no seam)
                d_ = K["water"] - G.y(x, z)
                lake_c = mixc(mixc("lakeShallow", "lakeMid", smooth(0.05, 0.45, d_)), "waterDark", smooth(0.5, 1.4, d_))
                t_ = smooth(1.4, 1.15, lake_factor(L, x, z))
                edge = mixc(edge, lake_c, t_)
                mid = mixc(mid, lake_c, t_)
            # (on a fall, every vertex kept over the ground under it: the water pours down the rock,
            # never through it; docs/caverns-roadmap.md R6.4)
            def wy(px, pz, base):
                return max(base, G.y(px, pz) + 0.07) if fall else base
            lx, lz = x + nx * half_w, z + nz * half_w
            cx_, cz_ = x + nx * half_w * 0.1 * math.sin(idx * 0.7), z + nz * half_w * 0.1 * math.sin(idx * 0.7)
            rx, rz = x - nx * half_w, z - nz * half_w
            # (the row on the plunge pool's edge laid on its round edge exactly: the stream leaves the pool
            # from its very surface, no straight seam across it; docs/caverns-roadmap.md R10.2)
            if kind == 3 and math.hypot(x - Pp["x"], z - Pp["z"]) < Pp["r"] + 0.3:
                def onto(px, pz):
                    d_ = math.hypot(px - Pp["x"], pz - Pp["z"]) or 1.0
                    return Pp["x"] + (px - Pp["x"]) / d_ * PLUNGE_R, Pp["z"] + (pz - Pp["z"]) / d_ * PLUNGE_R
                lx, lz = onto(lx, lz)
                cx_, cz_ = onto(cx_, cz_)
                rx, rz = onto(rx, rz)
            elif kind == 3:
                # (on a warm pool's edge: each point carried along the ray from the pool's middle to its
                # drawn edge, no overlap with the pool's own water and no gap)
                for k_, pl in enumerate(pools):
                    if not inside_poly(x, z, pool_outline(L, pl, grow=0.6)[1]):
                        continue

                    def onto_pool(px, pz, pl=pl, k_=k_):
                        dx_, dz_ = px - pl["x"], pz - pl["z"]
                        lo_, hi_ = 0.0, 3.0
                        for _ in range(18):
                            m_ = (lo_ + hi_) / 2
                            if inside_poly(pl["x"] + dx_ * m_, pl["z"] + dz_ * m_, POOL_EDGES[k_]):
                                lo_ = m_
                            else:
                                hi_ = m_
                        return pl["x"] + dx_ * lo_, pl["z"] + dz_ * lo_
                    lx, lz = onto_pool(lx, lz)
                    cx_, cz_ = onto_pool(cx_, cz_)
                    rx, rz = onto_pool(rx, rz)
                    break
            l = water.v(lx, wy(lx, lz, y), lz)
            c = water.v(cx_, wy(cx_, cz_, y) + 0.004, cz_)
            r = water.v(rx, wy(rx, rz, y), rz)
            water.setv(l, edge)
            water.setv(r, edge)
            water.setv(c, mid)
            if prev:
                water.setsmooth(water.facing((prev[0], prev[1], c, l), "aqua", (0.0, 1.0, 0.0)))
                water.setsmooth(water.facing((prev[1], prev[2], r, c), "aqua", (0.0, 1.0, 0.0)))
                ribbons += 2
            prev = (l, c, r)
            last = (x, z, tx, tz, half_w, y)
            # (stones breaking the riffles, a few along the edges)
            since_stone += 0.3
            if kind == 1 and since_stone > 1.0 and rng.random() < 0.6:
                side = rng.choice((-1, 1))
                ox = x + nx * side * half_w * (0.35 + 0.4 * rng.random())
                oz = z + nz * side * half_w * (0.35 + 0.4 * rng.random())
                s_ = 0.09 + 0.07 * rng.random()
                angular(rock, ox, y - 0.06, oz, s_, s_ * 0.9, rng, "pebble", "pebbleDark", sink=0.0, squash=0.8, npts=8)
                foam_disc(water, ox - tx * 0.12, oz - tz * 0.12, y + 0.008, s_ * 1.6, mixc("aqua", "waterDark", 0.35), rng, squash=0.7, n_ang=10, n_rad=2, strength=0.7)
                since_stone = 0.0
                stones += 1
        # (a reach running off the map's open edge: its strip carried on down the pedestal's side into
        # the dark, whitening as it goes, one sheet with the water above it: docs/caverns-roadmap.md R6.4)
        if prev and last and (abs(last[0]) > L["half"] - 0.6 or abs(last[1]) > L["half"] - 0.6):
            x, z, tx, tz, half_w, y = last
            nx, nz = -tz, tx
            row = prev
            for j in range(1, 9):
                t = j / 8
                out = 0.15 + 0.5 * t ** 0.6
                yy = y - (y - (SKIRT_Y + 0.4)) * t ** 1.4
                ww = half_w * (1 + 0.25 * t)
                cols = []
                for side in (1, 0, -1):
                    v = water.v(x + tx * out + nx * ww * side, yy, z + tz * out + nz * ww * side)
                    water.setv(v, mixc(mixc("aquaShallow", "foam", 0.35 + 0.4 * (side == 0)), "waterDark", t * 0.6))
                    cols.append(v)
                water.facing((row[0], row[1], cols[1], cols[0]), "aqua", (tx, 0.3, tz))
                water.facing((row[1], row[2], cols[2], cols[1]), "aqua", (tx, 0.3, tz))
                row = tuple(cols)
    GEO_STATS["streamQuads"] = ribbons
    GEO_STATS["streamStones"] = stones
    # the falls: a curtain off the lip, leaving it in a curve and thickening as it drops, streaked white
    # and whiter at its foot, into a splash of foam and a little pool of churned water
    for f in falls:
        x1, z1, y1 = f["x1"], f["z1"], f["y1"]
        tx, tz = f["tx"], f["tz"]
        nx, nz = -tz, tx
        # (a foot past the map's open edge: the strip's own fall carries it into the dark, no splash)
        if abs(x1) > L["half"] - 0.3 or abs(z1) > L["half"] - 0.3:
            continue
        # (the splash at its foot: churned water spreading from where it strikes, a stone either side
        # of a fall onto dry ground; into a pool, the pool's own water churned)
        fx, fz = x1 + tx * 0.1, z1 + tz * 0.1
        base = "thermalWater" if f.get("pool") else mixc("aqua", "waterDark", 0.35)
        target = therm if f.get("pool") else water
        # (the lip it pours over framed by a stone either side, so the step down reads at a glance)
        if f["y0"] - y1 > 0.6:
            for side in (-1, 1):
                lx_, lz_ = f["x0"] + nx * side * (f["w"] * Rv["half"] + 0.35), f["z0"] + nz * side * (f["w"] * Rv["half"] + 0.35)
                angular(rock, lx_, G.y(lx_, lz_) - 0.06, lz_, 0.26, 0.3, rng, "limestone", "limestoneDark", sink=0.08, npts=10)
        if not f.get("pool"):
            # (mossy stones either side of the churned water, set back from it)
            for side in (-1, 1):
                angular(rock, fx + tx * 0.3 + nx * side * 1.0, y1 - 0.1, fz + tz * 0.3 + nz * side * 1.0, 0.16, 0.16, rng, "limestone", "limestoneDark", sink=0.06, npts=9)
    # stepping stones across each ford, their tops just clear of the water
    for fxz in Rv["fords"]:
        fx, fz, fr = fxz
        best = None
        for reach in G.stream:
            for x, z, y, w, tx, tz, kind in reach:
                d = math.hypot(x - fx, z - fz)
                if best is None or d < best[0]:
                    best = (d, x, z, y, tx, tz)
        if best is None or best[0] > 1.0:
            continue
        _, x, z, y, tx, tz = best
        nx, nz = -tz, tx
        for k in (-1.5, -0.5, 0.5, 1.5):
            jog = 0.1 * (1 if int(k + 2) % 2 else -1)
            sx = x + nx * k * 0.42 + tx * jog
            sz = z + nz * k * 0.42 + tz * jog
            top = max(y + 0.05, G.y(sx, sz) + 0.06)
            angular(rock, sx, top - 0.14, sz, 0.2 + 0.03 * rng.random(), 0.14, rng, "flagstone", "flagstoneDark", sink=0.0, squash=0.95, npts=9)
    # the plunge pool at the waterfall's foot, and the fall itself down the north wall from the
    # collapse's lip
    # (the plunge pool, docs/caverns-roadmap.md R5.2: its water white where the fall strikes it and
    # fading into clear green, its rim ringed with mossy boulders but where the stream leaves it)
    fcx, fcz = Rv["plunge"]["fall"][0], Pp["z"] - Pp["r"] * 0.3
    foam_disc(water, Pp["x"], Pp["z"], py, PLUNGE_R, mixc("aqua", "waterDark", 0.25), rng, squash=1.0, n_ang=40, n_rad=6, hot=(fcx - Pp["x"], fcz - Pp["z"]), strength=0.8, wobble=False)
    out_x, out_z = Rv["segments"][0][1]
    a_out = math.atan2(out_z - Pp["z"], out_x - Pp["x"])
    for k in range(13):
        a = 2 * math.pi * k / 13 + 0.2
        if abs((a - a_out + math.pi) % (2 * math.pi) - math.pi) < 0.55:
            continue
        rr_ = Pp["r"] + 0.28 + 0.1 * math.sin(k * 2.3)
        bx, bz = Pp["x"] + math.cos(a) * rr_, Pp["z"] + math.sin(a) * rr_
        s_ = 0.22 + 0.12 * abs(math.sin(k * 1.7))
        angular(rock, bx, min(G.y(bx, bz), py + 0.1) - 0.05, bz, s_, s_ * 0.8, rng, "mossDeep" if k % 3 else "limestone", "limestoneDark", sink=0.08, squash=0.9, npts=10)
    fx, fz = Rv["plunge"]["fall"]
    top_y = wall_point(G, L, "x", fx, 1.0, [])[0][1] - 0.35
    # (the waterfall, docs/caverns-roadmap.md R9.4: a curtain thrown out off the lip in an arc and
    # dropping, bowed out at its middle and spreading as it falls, two sheets deep (the back one darker,
    # seen through the front), streaked white down its length and whitening into spray at its foot)
    land_z = Pp["z"] - Pp["r"] * 0.3
    rows, cols = 16, 9
    for layer, (bow, back, shade) in enumerate(((0.16, 0.0, 0.0), (0.06, -0.13, 0.35))):
        prev = None
        for j in range(rows + 1):
            t = j / rows
            y = top_y + (py - top_y) * t
            # (out off the lip quickly, then falling all but straight)
            z = fz + 0.45 + (land_z - fz - 0.45) * (1 - (1 - t) ** 2.2) + back
            row = []
            for c in range(cols + 1):
                w = c / cols
                half = 0.55 + 0.3 * t
                x = fx + (w * 2 - 1) * half + 0.05 * math.sin(t * 5 + c)
                zz = z + bow * math.sin(math.pi * w) * (0.6 + 0.4 * t) + 0.03 * math.sin(c * 2.1 + j * 0.9)
                v = water.v(x, y, zz)
                streak = 0.5 + 0.5 * math.sin(c * 2.7 + 1.1 + 0.4 * math.sin(j * 0.6))
                white = max(smooth(0.18, 0.0, t), smooth(0.7, 1.0, t))
                col = mixc(mixc("aquaShallow", "foam", 0.12 + 0.45 * streak), "foam", white * 0.8)
                water.setv(v, mixc(col, "waterDark", shade))
                row.append(v)
            if prev:
                for c in range(cols):
                    water.setsmooth(water.facing((prev[c], prev[c + 1], row[c + 1], row[c]), "aquaShallow", (0.0, 0.3, 1.0)))
            prev = row
    # (the foam where it lands is the pool's own churned water: foam_disc above)
