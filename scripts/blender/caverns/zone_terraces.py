"""The Pearl Terraces: dry rimstone basins with cave pearls on the terraces' apron
(`build_pearl_basins`)."""

import math
from .kit import blob


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
