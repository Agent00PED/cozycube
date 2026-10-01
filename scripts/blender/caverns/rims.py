"""The layout's rims as shared/worlds/caverns.ts draws them (the same wobble, sine for sine), every
cliff between two levels dressed as rock (`build_cliff_faces`), the terraces' rimstone lips round
their pools (`build_terrace_lips`), what the expedition left along the trails (`build_trail_edges`) and the map's rim over
the dark (`build_rim`)."""

import math
from .ground import near_polyline
from .kit import (
    angular, blob, cyl, fbm, frange, game_point, GEO_STATS, hash3, mixc, prism, SKIRT_Y, smooth,
)
from .waters import pool_outline


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
    """caverns.ts `shelfEdgeZ`: the shelf's south edge through its points, eased, wobbling."""
    e = L["shelf"]["edge"]
    z = e[-1][1]
    if x <= e[0][0]:
        z = e[0][1]
    else:
        for (ax, az), (bx, bz) in zip(e, e[1:]):
            if x > bx:
                continue
            t = max(0.0, min(1.0, (x - ax) / (bx - ax)))
            z = az + (bz - az) * t * t * (3 - 2 * t)
            break
    return z + 0.35 * wave(x * 0.7, 0.3, 21) + 0.12 * wave(x * 2.1, 1.7, 23)


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


_OVERFLOWS = []


def overflow_lines(G, L):
    """The overflows' lines, each pool's notch down to the next pool (as waters.build_waters draws them)."""
    if _OVERFLOWS:
        return _OVERFLOWS
    pools = L["terraces"]["pools"]
    ends = pool_ends(G, L)
    for i, (a, b) in enumerate(zip(pools, pools[1:])):
        _, ra = pool_outline(L, a, grow=0.02, segs=56)
        _, rb = pool_outline(L, b, grow=0.02, segs=56)
        a_out = ends[i][1]
        pa = min(ra, key=lambda q: abs((math.atan2(q[1] - a["z"], q[0] - a["x"]) - a_out + math.pi) % (2 * math.pi) - math.pi))
        pb = min(rb, key=lambda q: math.hypot(q[0] - pa[0], q[1] - pa[1]))
        _OVERFLOWS.append([pa, pb])
    return _OVERFLOWS


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
    if any(near_polyline(x, z, seg) < Rv["half"] + 0.9 for seg in Rv["segments"]):
        return False
    # (nor over the overflows running down between the pools: docs/caverns-roadmap.md R5.2)
    if any(near_polyline(x, z, line) < 0.75 for line in overflow_lines(G, L)):
        return False
    return math.hypot(x - Rv["plunge"]["x"], z - Rv["plunge"]["z"]) > Rv["plunge"]["r"] + 0.8


CLIFF_BAND = {"jungle": 0.5, "basecamp": 0.55, "breakdown": 0.6, "crystal": 0.7, "overlook": 0.5, "mud": 0.45, "gour": 0.26}


def cliff_colour(style, t, y, u, band_i):
    """A cliff face's paint: `t` up it (0 its foot, 1 its lip), its strata by band, each band broken
    into blocks along it."""
    alt = 0.5 * (band_i % 2) + 0.9 * (hash3(int(math.floor(u / 0.9)), band_i, 5) - 0.5)
    if style == "gour":
        # (docs/caverns-roadmap.md R7.1: never a white paper cut-out; tan and cream, darker and damp at
        # the foot, a pale lip only at the brim)
        c = mixc("greatShadow", "travRockDark", 0.35 + 0.35 * alt + 0.3 * t)
        c = mixc(c, "travAmber", 0.25 * smooth(0.5, 0.9, fbm(u * 0.8, y * 0.5, 1.0, 71)))
        return mixc(c, "travRock", 0.55 * smooth(0.82, 1.0, t))
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


CLIFF_OF_SURF = {0: "basecamp", 1: "jungle", 2: "breakdown", 3: "mud", 4: "overlook", 5: "gour", 6: "crystal"}


def cliff_blend(G, x, z, style):
    """Where two zones' cliffs meet, the other one's paint and how much of it (docs/caverns-roadmap.md
    R3.7: the mud's bluffs and the overlook's grey limestone blend over a metre or two, never a seam):
    read off the ground round the sample."""
    w = {}
    for k in range(10):
        a = 2 * math.pi * k / 10
        for r in (0.9, 1.8):
            st = CLIFF_OF_SURF.get(G.surf(x + math.cos(a) * r, z + math.sin(a) * r))
            if st:
                w[st] = w.get(st, 0.0) + (1.0 if r < 1.0 else 0.6)
    own = w.pop(style, 0.0) + 4.0
    if not w:
        return None, 0.0
    other, wo = max(w.items(), key=lambda kv: kv[1])
    return other, 0.5 * wo / (own + wo)


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
            other, blend = cliff_blend(G, x, z, style)
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
                    paint = cliff_colour(style, tm, ym, u, a0[3])
                    if other and blend > 0.02:
                        paint = mixc(paint, cliff_colour(other, tm, ym, u, a0[3]), blend)
                    rock.facing([a0[0], a1[0], b1[0], b0[0]], paint, (nx, 0.25, nz))
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


def pool_ends(G, L):
    """Where each warm pool takes its water in and lets it out (docs/caverns-roadmap.md R3.4): the top
    pool fed by the stream falling into it, each pool spilling into the next, the last one out into the
    stream on to the lake. Each as the angle round the pool's middle (in its own turned frame)."""
    from .waters import inside_poly, pool_outline
    pools = L["terraces"]["pools"]
    reaches = G.stream
    ends = []
    arrive = None
    for i, p in enumerate(pools):
        if i == 0:
            # (where the stream actually comes in: its first sample over the pool's rim)
            src = reaches[0][-1][:2] if reaches else (p["x"], p["z"] - 1)
            if reaches:
                ol = pool_outline(L, p, grow=0.2, segs=56)[1]
                for smp in reaches[0]:
                    if inside_poly(smp[0], smp[1], ol):
                        src = smp[:2]
                        break
        else:
            src = arrive
        if i + 1 < len(pools):
            dst = (pools[i + 1]["x"], pools[i + 1]["z"])
        else:
            dst = reaches[1][0][:2] if len(reaches) > 1 else (p["x"], p["z"] + 1)
        a_out = math.atan2(dst[1] - p["z"], dst[0] - p["x"])
        ends.append((math.atan2(src[1] - p["z"], src[0] - p["x"]), a_out))
        if i + 1 < len(pools):
            # (the overflow's foot in the next pool: the nearest point of its rim to this one's notch,
            # as waters.build_waters draws it)
            ra = pool_outline(L, p, grow=0.02, segs=56)[1]
            rb = pool_outline(L, pools[i + 1], grow=0.02, segs=56)[1]
            pa = min(ra, key=lambda q: abs((math.atan2(q[1] - p["z"], q[0] - p["x"]) - a_out + math.pi) % (2 * math.pi) - math.pi))
            arrive = min(rb, key=lambda q: math.hypot(q[0] - pa[0], q[1] - pa[1]))
    return ends


def _adiff(a, b):
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def build_terrace_lips(G, L, rock):
    """The rimstone round every warm pool, grown, never rung (docs/caverns-roadmap.md R3.4): heavy and
    high on its upstream side, thin and scalloped where the water spills over, cream at its crest,
    tan to ochre down its outside into the terrace's slope, a dark wet band at the waterline; a notch
    in it where the water comes in and where it spills out, the rim there sunk to the water."""
    pools = L["terraces"]["pools"]
    ends = pool_ends(G, L)
    GEO_STATS["poolEnds"] = [[round(a, 3) for a in e] for e in ends]
    for i, p in enumerate(pools):
        a_in, a_out = ends[i]
        segs = 56
        # (the rings: grow out from the water, height over it; the last one lies on the ground)
        spec = ((-0.06, -0.035), (0.05, 0.05), (0.14, 0.13), (0.3, 0.11), (0.46, 0.05), (0.62, None))
        rings = []
        for k, (grow, dy) in enumerate(spec):
            _, outline = pool_outline(L, p, grow=0.0, segs=segs)
            ring = []
            gaps = []
            for j, (ox, oz) in enumerate(outline):
                a = math.atan2(oz - p["z"], ox - p["x"])
                down = max(0.0, math.cos(_adiff(a, a_out)))
                # (each notch about 0.6 m of the rim either side of where the water crosses it, measured
                # along the rim, whatever the pool's size)
                rad = math.hypot(ox - p["x"], oz - p["z"])
                notch = max(math.exp(-(_adiff(a, a_out) * rad / 0.6) ** 2), math.exp(-(_adiff(a, a_in) * rad / 0.6) ** 2))
                gaps.append(notch > 0.5)
                wide = (1.25 - 0.6 * down + 0.18 * math.sin(7 * a + i * 1.9)) * (1 - 0.45 * notch)
                high = (1.2 - 0.55 * down + 0.22 * math.sin(5 * a + i * 2.3) + 0.1 * math.sin(11 * a + i)) * (1 - notch)
                # (the downhill side scalloped: little lobes along its brim)
                scal = 0.05 * down * max(0.0, math.sin(13 * a + i))
                g = grow * wide + (scal if k >= 2 else 0.0)
                d = math.hypot(ox - p["x"], oz - p["z"]) or 1.0
                x = ox + (ox - p["x"]) / d * g
                z = oz + (oz - p["z"]) / d * g
                if dy is None:
                    y = G.y(x, z) + 0.005
                    colr = "travOchre" if math.sin(3 * a + i) > 0.3 else "travAmber"
                elif k == 0:
                    y = p["y"] + dy
                    colr = "travWet"
                else:
                    # (at a notch the rim dips smoothly under the water running over it, wet and dark:
                    # never cut off in open ends; docs/caverns-roadmap.md R10.4)
                    y = max(p["y"] + dy * high, p["y"] + 0.012) * (1 - notch) + (p["y"] - 0.14) * notch
                    # (cream at the crest, warmer down its outside; wet where the water runs over)
                    colr = "travWet" if notch > 0.35 else {1: "travWet", 2: "travRock", 3: "travRockDark", 4: "travAmber"}[k]
                v = rock.v(x, y, z)
                rock.setv(v, colr)
                ring.append(v)
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            n = len(r0)
            for j in range(n):
                q = (j + 1) % n
                rock.setsmooth(rock.facing((r0[j], r0[q], r1[q], r1[j]), "travRock", (0.0, 1.0, 0.0)))


def build_trail_edges(G, L, rock, glow, rng):
    """The trails as an expedition's traces (docs/caverns-roadmap.md R3.1), never a built way: the
    ground itself shows only a worn line (client/src/scene/caveSurface.ts); along it what the
    expedition left behind. The rope descent keeps its stakes and hand rope on its drop side, its top
    anchored to an iron pin with the rope's end coiled by it; a survey stake with a faded ribbon where
    each trail begins and at its turns; a chalk arrow on a stone by each trail's head, pointing the
    way; a cold fire ring beside the pearl trail; a dropped canteen and a scrap of map here and there."""

    def off(x, z, dx, dz, side, dist):
        return x - dz * side * dist, z + dx * side * dist

    def upslope(x, z, dx, dz, dist):
        # (the side of the tread the ground rises on: nothing left on the drop side)
        l = off(x, z, dx, dz, 1, dist)
        r = off(x, z, dx, dz, -1, dist)
        return 1 if G.y(*l) >= G.y(*r) else -1

    def survey_stake(x, z, lean):
        y = G.y(x, z)
        tx, tz = x + 0.06 * math.cos(lean), z + 0.06 * math.sin(lean)
        cyl(rock, (x, y - 0.12, z), (tx, y + 0.62, tz), 0.028, "timberDark", sides=5)
        # (the ribbon: two tails tied near the top, hanging in the still air)
        for k2, (ln, sw) in enumerate(((0.26, 0.05), (0.2, -0.04))):
            top = (tx, y + 0.56 - 0.03 * k2, tz)
            end = (tx + sw + 0.02 * rng.random(), y + 0.56 - ln, tz + 0.03 * rng.random())
            w = 0.018
            col = "ribbon" if k2 == 0 else "ribbonFaded"
            p0 = rock.v(top[0] - w, top[1], top[2])
            p1 = rock.v(top[0] + w, top[1], top[2])
            p2 = rock.v(end[0] + w, end[1], end[2] + 0.01)
            p3 = rock.v(end[0] - w, end[1], end[2] + 0.01)
            rock.face((p0, p1, p2, p3), col)
            q0 = rock.v(top[0] - w, top[1], top[2] - 0.002)
            q1 = rock.v(top[0] + w, top[1], top[2] - 0.002)
            q2 = rock.v(end[0] + w, end[1], end[2] + 0.008)
            q3 = rock.v(end[0] - w, end[1], end[2] + 0.008)
            rock.face((q3, q2, q1, q0), col)

    def chalk_arrow(x, z, dx, dz):
        # a stone by the trail's head, a chalk arrow on its top pointing down the trail
        y = G.y(x, z)
        angular(rock, x, y, z, 0.26, 0.2, rng, "limestoneLight", "limestone", sink=0.02, squash=1.0, npts=10)
        top = y + 0.2
        nx, nz = -dz, dx

        def P(u, v):
            return rock.v(x + dx * u + nx * v, top, z + dz * u + nz * v)

        rock.face([P(-0.13, -0.018), P(0.04, -0.018), P(0.04, 0.018), P(-0.13, 0.018)], "chalk")
        rock.face([P(0.04, -0.06), P(0.04, 0.06), P(0.13, 0.0)], "chalk")

    def canteen(x, z, yaw):
        y = G.y(x, z) + 0.05
        cx, cz = math.cos(yaw), math.sin(yaw)
        cyl(rock, (x - cx * 0.09, y, z - cz * 0.09), (x + cx * 0.09, y, z + cz * 0.09), 0.06, "canteen", sides=8)
        cyl(rock, (x + cx * 0.09, y, z + cz * 0.09), (x + cx * 0.13, y, z + cz * 0.13), 0.02, "iron", sides=5)
        cyl(rock, (x - cz * 0.06, y + 0.05, z + cx * 0.06), (x - cz * 0.32, y - 0.04, z + cx * 0.32), 0.008, "leather", sides=3)

    def map_scrap(x, z, yaw):
        y = G.y(x, z) + 0.025
        c, s2 = math.cos(yaw), math.sin(yaw)
        pts = [(-0.14, -0.1), (0.13, -0.11), (0.15, 0.07), (0.02, 0.1), (-0.12, 0.09)]
        vs = [rock.v(x + u * c - v * s2, y + 0.008 * (u + 0.14), z + u * s2 + v * c) for u, v in pts]
        rock.face(vs, "mapPaper")
        # (a weighting pebble on a corner)
        angular(rock, x + 0.11 * c, y, z + 0.11 * s2, 0.05, 0.04, rng, "pebble", "pebbleDark", sink=0.0, npts=7)

    def fire_ring(x, z):
        y = G.y(x, z)
        for k2 in range(8):
            t = 2 * math.pi * k2 / 8 + rng.uniform(-0.15, 0.15)
            angular(rock, x + 0.34 * math.cos(t), G.y(x + 0.34 * math.cos(t), z + 0.34 * math.sin(t)), z + 0.34 * math.sin(t), 0.09 + 0.03 * rng.random(), 0.08, rng, "limestone", "limestoneDark", sink=0.03, npts=7)
        blob(rock, x, y + 0.004, z, 0.24, 0.018, 0.24, "ash", cuts=1)
        blob(rock, x + 0.03, y + 0.012, z - 0.02, 0.12, 0.015, 0.1, "charcoal", cuts=1)
        for k2 in range(3):
            t = rng.uniform(0, math.pi)
            cyl(rock, (x - 0.2 * math.cos(t), y + 0.03, z - 0.2 * math.sin(t)), (x + 0.18 * math.cos(t), y + 0.045, z + 0.18 * math.sin(t)), 0.028, "charcoal", sides=5)

    placed = []

    def clear(x, z, r=0.8):
        return all(math.hypot(x - px, z - pz) > r for px, pz in placed)

    for p in L["paths"]:
        pts = p["points"]
        half = p["half"]
        # the rope descent: its stakes and hand rope on the drop side
        if p["id"] == "ropeDescent":
            stakes = []
            for (ax, az, _), (bx, bz, _) in zip(pts, pts[1:]):
                ln = math.hypot(bx - ax, bz - az)
                dx, dz = (bx - ax) / ln, (bz - az) / ln
                for t in frange(0.3, ln - 0.3, 1.1):
                    for side in (-1, 1):
                        ex, ez = off(ax + dx * t, az + dz * t, dx, dz, side, half + 0.3)
                        if G.walk(ex, ez):
                            continue
                        if G.y(ex, ez) < G.y(ax + dx * t, az + dz * t) - 0.12:
                            stakes.append((ex, G.y(ex, ez), ez))
            for x, y, z in stakes:
                cyl(rock, (x, y - 0.15, z), (x, y + 0.8, z), 0.05, "timberDark", sides=5)
            for (x0, y0, z0), (x1, y1, z1) in zip(stakes, stakes[1:]):
                if math.hypot(x1 - x0, z1 - z0) < 1.6:
                    cyl(rock, (x0, y0 + 0.72, z0), (x1, y1 + 0.72, z1), 0.016, "canvasShade", sides=4)
            if stakes:
                # (the anchor at the top: an iron pin driven into the rock, the rope's end coiled by it)
                x, y, z = stakes[0]
                ln = math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
                ax2 = x - 0.45 * (pts[1][0] - pts[0][0]) / ln
                az2 = z - 0.45 * (pts[1][1] - pts[0][1]) / ln
                ay = G.y(ax2, az2)
                cyl(rock, (ax2, ay - 0.1, az2), (ax2, ay + 0.22, az2), 0.03, "iron", sides=6)
                cyl(rock, (ax2, ay + 0.2, az2), (x, y + 0.72, z), 0.016, "canvasShade", sides=4)
                for k2 in range(3):
                    r2 = 0.16 - 0.025 * k2
                    ring = [(ax2 + 0.22 + r2 * math.cos(2 * math.pi * q / 9), ay + 0.02 + 0.018 * k2, az2 + r2 * math.sin(2 * math.pi * q / 9)) for q in range(9)]
                    for q in range(9):
                        cyl(rock, ring[q], ring[(q + 1) % 9], 0.014, "canvasShade", sides=3, cap=False)
        # the survey stakes: where the trail begins and at each turn, on its high side
        for i, (x, z, _) in enumerate(pts[:-1]):
            bx, bz = pts[i + 1][0], pts[i + 1][1]
            ln = math.hypot(bx - x, bz - z)
            dx, dz = (bx - x) / ln, (bz - z) / ln
            u = 0.6 if i == 0 else 0.0
            side = upslope(x + dx * u, z + dz * u, dx, dz, half + 0.25)
            sx, sz = off(x + dx * u, z + dz * u, dx, dz, side, half + 0.25)
            if clear(sx, sz, 1.2):
                survey_stake(sx, sz, rng.uniform(0, 2 * math.pi))
                placed.append((sx, sz))
        # a chalk arrow by the trail's head, pointing down it
        if p["id"] != "ropeDescent":
            (x, z, _), (bx, bz, _) = pts[0], pts[1]
            ln = math.hypot(bx - x, bz - z)
            dx, dz = (bx - x) / ln, (bz - z) / ln
            side = -upslope(x + dx * 1.2, z + dz * 1.2, dx, dz, half + 0.45)
            sx, sz = off(x + dx * 1.2, z + dz * 1.2, dx, dz, side, half + 0.4)
            if clear(sx, sz, 0.7):
                chalk_arrow(sx, sz, dx, dz)
                placed.append((sx, sz))

    # a cold fire ring off the pearl trail's upper reach, where the expedition camped a night
    pearl = next(p for p in L["paths"] if p["id"] == "pearlTrail")
    (ax, az, _), (bx, bz, _) = pearl["points"][1], pearl["points"][2]
    ln = math.hypot(bx - ax, bz - az)
    dx, dz = (bx - ax) / ln, (bz - az) / ln
    done = False
    for frac in (0.45, 0.3, 0.6):
        for dist in (pearl["half"] + 0.9, pearl["half"] + 0.6):
            for side in (1, -1):
                fx, fz = off(ax + dx * ln * frac, az + dz * ln * frac, dx, dz, side, dist)
                if not done and all(G.walk(fx + ox, fz + oz) for ox, oz in ((0, 0), (0.45, 0), (-0.45, 0), (0, 0.45), (0, -0.45))) and clear(fx, fz, 1.0):
                    fire_ring(fx, fz)
                    placed.append((fx, fz))
                    done = True
    GEO_STATS["fire_ring"] = done

    # what was dropped: a canteen and a map scrap at the tread's edge, never in its middle
    drops = [("switchback", 0.62, canteen), ("lakeRamp", 0.4, map_scrap), ("pearlTrail", 0.2, map_scrap)]
    for pid, frac, make in drops:
        p = next(q for q in L["paths"] if q["id"] == pid)
        pts = p["points"]
        seg = min(int(frac * (len(pts) - 1)), len(pts) - 2)
        (ax, az, _), (bx, bz, _) = pts[seg], pts[seg + 1]
        ln = math.hypot(bx - ax, bz - az)
        dx, dz = (bx - ax) / ln, (bz - az) / ln
        t = (frac * (len(pts) - 1) - seg) * ln
        side = upslope(ax + dx * t, az + dz * t, dx, dz, p["half"])
        x, z = off(ax + dx * t, az + dz * t, dx, dz, side, p["half"] * 0.8)
        if clear(x, z, 0.6):
            make(x, z, rng.uniform(0, 2 * math.pi))
            placed.append((x, z))


def build_far_passage(G, L, glow, rng):
    """The cave going on past the open rims (docs/caverns-roadmap.md R2.10): the south and east edges
    face the camera, so nothing rises there; below them, far down in the dark, the faint glints of
    crystals and fungi on a passage floor you will never reach, dim and scattered, fading the further
    and deeper they lie."""
    half = L["half"]
    made = 0
    for _ in range(400):
        if made >= 46:
            break
        side = rng.random() < 0.5
        t = -half + 2.0 + rng.random() * (2 * half - 3.0)
        out = 1.5 + rng.random() * 9.0
        x, z = (t, half + out) if side else (half + out, t)
        depth = -2.5 - out * 0.55 - rng.random() * 2.5
        dim = min(0.85, 0.35 + out / 14.0)
        col = mixc("abyssCyan" if rng.random() < 0.6 else "abyssViolet", "tunnel", dim * 0.6)
        if rng.random() < 0.55:
            prism(glow, (x, depth, z), (rng.uniform(-0.4, 0.4), 1.0, rng.uniform(-0.4, 0.4)), 0.05 + 0.04 * rng.random(), 0.25 + 0.3 * rng.random(), col, sides=4)
        else:
            blob(glow, x, depth, z, 0.07, 0.05, 0.07, col, cuts=0)
        made += 1
    GEO_STATS["farGlints"] = made


def build_rim(G, L, rock, water, rng):
    """The map's open edges (south and east, the camera's side): the ground falling away into the dark,
    nothing lined along them; the lake's outflow falling over the east rim into the dark."""
    half = L["half"]
    Rv = L["river"]
    out = Rv["segments"][-1]
    # (no rocks lined along the open edges: docs/caverns-roadmap.md R6.6, they read as a row of
    # stones set out along the map's rim; the ground falls away into the dark on its own)
    # (the lake's outflow falls on down the rim as the stream's own strip: waters.build_waters)


