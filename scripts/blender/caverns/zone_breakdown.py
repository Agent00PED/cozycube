"""The Coal Breakdown: fallen tabular slabs with coal in their beds, and gravel (`build_breakdown`,
`broken_slab`)."""

import math
from .ground import free_spot, SURF
from .kit import angular, broken_slab, GEO_STATS, hullbox, turned


def build_breakdown(G, L, rock, rng):
    """The collapse's debris: great tabular slabs fallen and tilted, black coal bands in their beds;
    gravel strewn over the floor."""
    for x, z, r, yaw in L["slabs"]:
        y = G.y(x, z)
        # (fallen and tilted, cracked through its bedding into two layers that slid apart a little:
        # docs/caverns-roadmap.md R7.1, never a cube set down on the floor)
        rot = turned(yaw, roll=0.22 + 0.25 * rng.random(), pitch=0.35 * (rng.random() - 0.5))
        broken_slab(rock, (x, y + r * 0.28, z), rot, r * 1.1, r * 0.3, r * 0.8, rng)
        rot2 = turned(yaw + 0.25 * (rng.random() - 0.5), roll=0.3 + 0.3 * rng.random(), pitch=0.3 * (rng.random() - 0.5))
        broken_slab(rock, (x + math.cos(yaw) * r * 0.25, y + r * 0.62, z + math.sin(yaw) * r * 0.2), rot2, r * 0.8, r * 0.2, r * 0.6, rng)
        # its bedding: a thin seam of coal between the two
        hullbox(rock, (x, y + r * 0.5, z), rot, r * 0.85, r * 0.035, r * 0.6, "coalChunk", "coalChunk")
        # (spalls broken off it lying about its foot)
        for k in range(3):
            a = yaw + 2.1 * k + rng.random()
            sx, sz = x + math.cos(a) * r * 1.25, z + math.sin(a) * r * 1.0
            broken_slab(rock, (sx, G.y(sx, sz) + r * 0.08, sz), turned(a, roll=0.4 * rng.random(), pitch=0.3 * rng.random()), r * 0.28, r * 0.08, r * 0.2, rng)
        angular(rock, x + math.cos(yaw + 1.6) * r * 1.1, G.y(x, z), z + math.sin(yaw + 1.6) * r * 1.1, r * 0.35, r * 0.3, rng, "limestoneLight", "limestone", sink=0.1, npts=9)
    made = 0
    for _ in range(600):
        if made >= 70:
            break
        x, z = 9.4 + rng.random() * 12.2, -21.4 + rng.random() * 8.8
        if G.surf(x, z) != SURF["breakdown"] or not free_spot(G, L, x, z, clear=0.8):
            continue
        s = 0.07 + 0.1 * rng.random()
        angular(rock, x, G.y(x, z), z, s, s * 0.8, rng, "gravelLight" if rng.random() < 0.5 else "limestone", "gravelDark", sink=0.04, npts=6)
        made += 1
    GEO_STATS["gravel"] = made
