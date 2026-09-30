"""The Glimmer Rift: basalt stubs, fungi and glowworms up the crystal wall (`build_rift_decor`,
`basalt_stub`)."""

import math
from .ground import free_spot
from .kit import blob, cyl, fungi, GEO_STATS, hash3
from .rims import shelf_rim_z


def build_rift_decor(G, L, rock, glow, rng):
    """The Glimmer Rift: stubs of basalt columns broken off on its floor, fungi glowing at the crystal
    wall's foot, and glowworms: a starfield of blue-green points up the wall's face, a few threads hung
    from its ledges."""
    for x, z, r in L["stubs"]:
        y = G.y(x, z)
        for k in range(4 + int(rng.random() * 3)):
            a = 2 * math.pi * k / 5 + rng.random() * 0.5
            d = r * 0.6 * (0.3 + 0.7 * rng.random()) if k else 0.0
            h = (0.35 + 0.9 * rng.random()) * (1.3 if k == 0 else 1.0)
            basalt_stub(rock, x + math.cos(a) * d, y - 0.1, z + math.sin(a) * d, 0.16 + 0.08 * rng.random(), h, k + int(x * 10))
    for k in range(10):
        x = 11.8 + rng.random() * 9.8
        z = shelf_rim_z(L, x) + 0.9 + rng.random() * 0.8
        if G.walk(x, z) and free_spot(G, L, x, z, clear=0.6):
            fungi(rock, glow, x, G.y(x, z), z, 0.6 + 0.4 * rng.random(), rng)
    # the glowworms up the crystal wall's face (a point wherever the face stands at that height)
    made = 0
    for k in range(140):
        x = 11.4 + rng.random() * 10.6
        rz = shelf_rim_z(L, x)
        top, low = G.y(x, rz - 0.8), G.y(x, rz + 0.8)
        if top - low < 2.0:
            continue
        y = low + (top - low) * (0.45 + 0.5 * rng.random())
        lo, hi = rz - 0.8, rz + 0.8
        for _ in range(10):
            mid = (lo + hi) / 2
            if G.y(x, mid) > y:
                lo = mid
            else:
                hi = mid
        z = (lo + hi) / 2 + 0.28
        blob(glow, x, y, z, 0.022, 0.022, 0.022, "glowworm", cuts=0)
        if k % 9 == 0:
            cyl(glow, (x, y, z), (x, y - 0.3 - 0.4 * rng.random(), z + 0.02), 0.004, "glowworm", sides=3, cap=False)
        made += 1
    GEO_STATS["glowworms"] = made


def basalt_stub(M, x, y0, z, r, h, seed):
    """A column of basalt broken off low: a hexagonal prism, its top a tilted fracture."""
    ring = [(x + r * math.cos(math.pi * k / 3), z + r * math.sin(math.pi * k / 3)) for k in range(6)]
    tilt = 0.1 * hash3(seed, 3, 7)
    lo = [M.v(px, y0, pz) for px, pz in ring]
    hi = [M.v(px, y0 + h + tilt * math.cos(math.pi * k / 3 + seed), pz) for k, (px, pz) in enumerate(ring)]
    for k in range(6):
        k1 = (k + 1) % 6
        a = math.pi * (k + 0.5) / 3
        M.facing((lo[k], lo[k1], hi[k1], hi[k]), "basaltCol" if k % 2 else "basaltColLight", (math.cos(a), 0.0, math.sin(a)))
    M.facing(list(hi), "basaltTop", (0.0, 1.0, 0.0))
