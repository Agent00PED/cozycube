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
        rot = turned(yaw, roll=0.12 + 0.15 * rng.random(), pitch=0.18 * (rng.random() - 0.5))
        broken_slab(rock, (x, y + r * 0.35, z), rot, r * 1.1, r * 0.42, r * 0.8, rng)
        # its bedding: a band of coal through the slab's side
        hullbox(rock, (x, y + r * 0.3, z), rot, r * 0.98, r * 0.07, r * 0.7, "coalChunk", "coalChunk")
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
