"""The Pearl Terraces: dry rimstone basins with cave pearls on the terraces' apron
(`build_pearl_basins`)."""

import math
from .ground import inside_poly
from .kit import angular, blob, GEO_STATS, stalagmite
from .waters import pool_outline


def build_pearl_basins(G, L, rock, rng):
    """Dry rimstone basins on the terraces' apron, cave pearls in them (after Son Doong's): a little
    lip of travertine, the pearls polished white inside (walked past, never over)."""
    for x, z, r in L["pearls"]:
        y = G.y(x, z)
        rings = []
        for rr, dy, colr in ((r * 0.75, -0.03, "travRockDark"), (r, 0.07, "travRock"), (r * 1.25, 0.0, "travRockDark")):
            ring = []
            for j in range(14):
                a = 2 * math.pi * j / 14
                w = 1 + 0.1 * math.sin(3 * a + x)
                px, pz = x + math.cos(a) * rr * w, z + math.sin(a) * rr * w
                v = rock.v(px, G.y(px, pz) + dy, pz)
                rock.setv(v, colr)
                ring.append(v)
            rings.append(ring)
        c = rock.v(x, y - 0.03, z)
        rock.setv(c, "travRockDark")
        for a_, b_ in zip(rings[0], rings[0][1:] + rings[0][:1]):
            rock.setsmooth(rock.facing((c, a_, b_), "travRockDark", (0.0, 1.0, 0.0)))
        for r0, r1 in zip(rings, rings[1:]):
            for j in range(14):
                j1 = (j + 1) % 14
                rock.setsmooth(rock.facing((r0[j], r0[j1], r1[j1], r1[j]), "travRock", (0.0, 1.0, 0.0)))
        for k in range(5 + int(rng.random() * 4)):
            a = rng.random() * 6.283
            d = r * 0.5 * rng.random()
            s = 0.045 + 0.035 * rng.random()
            blob(rock, x + math.cos(a) * d, y + s * 0.6, z + math.sin(a) * d, s, s, s, "pearl", cuts=1)


def build_unreached(G, L, rock, rng):
    """The ground no one can walk to (docs/caverns-roadmap.md R4.1: the terraces' west ledges behind
    their pools, a sliver walled in by stones) dressed so it never reads as floor: on travertine, dry
    rimstone basins crowding it and little stalagmites; anywhere else, rubble and stalagmites."""
    cells = [tuple(c) for c in G.unreached]
    if not cells:
        return
    taken = []
    made = 0
    rng.shuffle(cells)
    for x, z in cells:
        # (sparse, never crowding: docs/caverns-roadmap.md R9.5, a field of rings read as bubbles)
        if any((x - tx) ** 2 + (z - tz) ** 2 < 1.15 ** 2 for tx, tz in taken):
            continue
        # (never at a pool's edge, standing in its water)
        if G.surf(x, z) == 11 or any(inside_poly(x, z, pool_outline(L, p, grow=0.45)[1]) for p in L["terraces"]["pools"]):
            continue
        taken.append((x, z))
        y = G.y(x, z)
        trav = G.surf(x, z) == 5
        pick = rng.random()
        if trav and pick < 0.35:
            # a dry gour: a low scalloped lip of travertine curving round a hollow, open on its uphill
            # side where the water once ran in, its floor darker
            r = 0.25 + 0.25 * rng.random()
            gap = rng.random() * 2 * math.pi
            rings = []
            for rr, dy, colr in ((r * 0.75, -0.015, "travWet"), (r, 0.05, "travRock"), (r * 1.25, 0.0, "travAmber")):
                ring = []
                for j in range(12):
                    a = 2 * math.pi * j / 12
                    w = 1 + 0.12 * math.sin(3 * a + x * 2.1)
                    px, pz = x + math.cos(a) * rr * w, z + math.sin(a) * rr * w
                    v = rock.v(px, G.y(px, pz) + dy, pz)
                    rock.setv(v, colr)
                    ring.append(v)
                rings.append(ring)
            for r0, r1 in zip(rings, rings[1:]):
                for j in range(12):
                    q = (j + 1) % 12
                    if math.cos(2 * math.pi * (j + 0.5) / 12 - gap) > 0.55:
                        continue
                    rock.setsmooth(rock.facing((r0[j], r0[q], r1[q], r1[j]), "travRock", (0.0, 1.0, 0.0)))
        elif trav and pick < 0.6:
            # a scatter of travertine pebbles, never a disc laid on the floor
            for _q in range(3):
                ox, oz = x + rng.uniform(-0.3, 0.3), z + rng.uniform(-0.3, 0.3)
                angular(rock, ox, G.y(ox, oz), oz, 0.06 + 0.05 * rng.random(), 0.06, rng, "travRock", "travRockDark", sink=0.03, npts=7)
        elif pick < 0.85:
            stalagmite(rock, x, y, z, 0.07 + 0.06 * rng.random(), 0.3 + 0.45 * rng.random())
        else:
            angular(rock, x, y, z, 0.14 + 0.1 * rng.random(), 0.16, rng, "travRock" if trav else "limestone", "travRockDark" if trav else "limestoneDark", sink=0.05, npts=8)
        made += 1
    GEO_STATS["unreachedDressing"] = made
