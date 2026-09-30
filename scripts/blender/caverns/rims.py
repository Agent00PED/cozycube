"""The layout's rims as shared/worlds/caverns.ts draws them (the same wobble, sine for sine), every
cliff between two levels dressed as rock (`build_cliff_faces`), the terraces' rimstone lips round
their pools (`build_terrace_lips`), the trails' edges (`build_trail_edges`) and the map's rim over
the dark (`build_rim`)."""

import math
from .ground import near_polyline
from .kit import (
    angular, cyl, fbm, frange, game_point, GEO_STATS, hash3, mixc, prism, SKIRT_Y, smooth,
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
            if along == "x" and abs(t - out[-2][1]) < 1.6:
                continue
            if rng.random() < 0.25:
                continue
            # (where the ground starts to fall away into the dark, or along the rift's lip its crest)
            base = G.y(t, 19.0) if along == "z" else G.y(19.0, t)
            best, top = None, -9.0
            for k in range(40):
                u = 19.0 + k * 0.085
                x, z = (t, u) if along == "z" else (u, t)
                h = G.y(x, z)
                if h < base - 0.35:
                    best = best or (x, z)
                    break
                if h > top + 0.02:
                    top, best = h, (x, z) if h > base + 0.5 else best
            if best is None:
                continue
            x, z = best
            x += (rng.random() - 0.5) * 0.3
            z += (rng.random() - 0.5) * 0.3
            y = G.y(max(-half, min(half, x)), max(-half, min(half, z)))
            r = 0.35 + 0.45 * rng.random()
            top_c, side_c = ("basaltTop", "basaltCol") if along == "x" and t < 11.0 else ("limestone", "limestoneDark")
            angular(rock, x, y, z, r, r * (0.5 + 0.6 * rng.random()), rng, top_c, side_c, sink=0.25, npts=11)
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
