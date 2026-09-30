"""The Iron Mudflats: the mud's dried plates cracked apart (Voronoi, `clip_half`), ochre puddles
(`build_mudflats`), and the bats roosting on the west wall over them (`build_bats`)."""

import math
from .ground import free_spot, near_polyline, SURF
from .kit import blob, cyl, fan, fbm, GEO_STATS, mixc, smooth
from .walls import wall_point


def clip_half(poly, mx, mz, nx, nz):
    """The part of a convex polygon on the near side of the line through (mx, mz) normal (nx, nz)."""
    out = []
    for k in range(len(poly)):
        a, b = poly[k], poly[(k + 1) % len(poly)]
        da = (a[0] - mx) * nx + (a[1] - mz) * nz
        db = (b[0] - mx) * nx + (b[1] - mz) * nz
        if da <= 0:
            out.append(a)
        if (da <= 0) != (db <= 0):
            t = da / (da - db)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def build_mudflats(G, L, rock, water, rng):
    """The Passchendaele's mud: dried plates cracked apart over the flats (Voronoi cells, each a little
    domed, a dark crack round it; walked over), wet and unbroken along the stream and in the hollows;
    ochre puddles here and there."""
    step = 0.62
    seeds = []
    z = -12.1
    while z < 1.5:
        x = -21.7
        while x < -6.5:
            seeds.append((x + (rng.random() - 0.5) * 0.52, z + (rng.random() - 0.5) * 0.52))
            x += step
        z += step
    cols = {}
    for sx, sz in seeds:
        cols.setdefault((int(sx // 1.3), int(sz // 1.3)), []).append((sx, sz))
    made = 0
    for sx, sz in seeds:
        if G.surf(sx, sz) != SURF["mudflats"] or not free_spot(G, L, sx, sz, clear=0.7):
            continue
        if near_polyline(sx, sz, L["river"]["segments"][0]) < 1.5 or fbm(sx * 0.4, 0.5, sz * 0.4, 83) > 0.38:
            continue
        cell = [(sx - 0.6, sz - 0.6), (sx + 0.6, sz - 0.6), (sx + 0.6, sz + 0.6), (sx - 0.6, sz + 0.6)]
        ci, ck = int(sx // 1.3), int(sz // 1.3)
        for di in (-1, 0, 1):
            for dk in (-1, 0, 1):
                for ox, oz in cols.get((ci + di, ck + dk), []):
                    if (ox, oz) == (sx, sz) or math.hypot(ox - sx, oz - sz) > 1.3:
                        continue
                    cell = clip_half(cell, (sx + ox) / 2, (sz + oz) / 2, ox - sx, oz - sz)
        if len(cell) < 3:
            continue
        cx = sum(p[0] for p in cell) / len(cell)
        cz = sum(p[1] for p in cell) / len(cell)
        ring = []
        for px, pz in cell:
            d = math.hypot(px - cx, pz - cz) or 1.0
            k = max(0.0, 1 - 0.055 / d)
            ring.append((cx + (px - cx) * k, cz + (pz - cz) * k))
        tone = rng.random()
        colr = mixc(mixc("groundMud", "mudPlate", 0.4 + 0.4 * tone), "mudPlateLight", 0.3 * smooth(0.6, 1.0, tone))
        centre = rock.v(cx, G.y(cx, cz) + 0.04, cz)
        vs = [rock.v(px, G.y(px, pz) + 0.015, pz) for px, pz in ring]
        for a_, b_ in zip(vs, vs[1:] + vs[:1]):
            rock.facing((centre, a_, b_), colr, (0.0, 1.0, 0.0))
        made += 1
    GEO_STATS["mudPlates"] = made
    # ochre puddles in the hollows
    for px, pz, r in ((-19.8, -6.4, 0.7), (-12.4, -11.2, 0.55), (-15.0, 0.4, 0.6), (-9.8, -8.8, 0.5)):
        if not G.walk(px, pz):
            continue
        py = G.y(px, pz) + 0.03
        fan(water, (px, pz), [(px + math.cos(-a) * r * (1 + 0.2 * math.sin(3 * a)), pz + math.sin(-a) * r * (1 + 0.2 * math.sin(3 * a))) for a in (2 * math.pi * j / 12 for j in range(12))], py, "mudWater")


def build_bats(G, L, rock, rng):
    """Bats roosting on the mudflats' wall, hung head down from its ledges (the ones that fly are the
    game's, from Fauna_Bat)."""
    for k in range(9):
        u = -11.5 + k * 1.35 + (rng.random() - 0.5) * 0.6
        v = 0.5 + 0.3 * rng.random()
        p = wall_point(G, L, "z", u, v, [])[0]
        x, y, z = p[0] + 0.12, p[1], p[2]
        blob(rock, x, y - 0.08, z, 0.045, 0.085, 0.05, "swift", cuts=1)
        for sz in (-1, 1):
            blob(rock, x + 0.01, y - 0.07, z + sz * 0.04, 0.03, 0.09, 0.022, "swift", cuts=0)
        cyl(rock, (x - 0.02, y + 0.02, z), (x - 0.05, y + 0.06, z), 0.008, "swift", sides=3)
