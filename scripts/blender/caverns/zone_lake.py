"""The Great Lake's shore: reeds and pebbles at the waterline and the islet's crag
(`build_lake_shore`), and the stepping stones out to the Monolith (`build_causeway`)."""

import math
from .ground import free_spot, lake_factor, near_polyline
from .kit import angular, fern, GEO_STATS, lump, reeds, rock_colour


def build_lake_shore(G, L, rock, rng):
    """The Great Lake's shore: pale cave reeds in clumps at the waterline, pebbles along the wet sand,
    and the islet's crag rising from the water at its south-west."""
    K = L["lake"]
    fin = L["finnegan"]
    made = 0
    for k in range(60):
        a = 2 * math.pi * k / 60 + rng.random() * 0.08
        for d in (1.02, 1.04, 1.07):
            x, z = K["x"] + math.cos(a) * K["rx"] * d, K["z"] + math.sin(a) * K["rz"] * d
            if lake_factor(L, x, z) >= 1.0 and G.walk(x, z):
                break
        else:
            continue
        if not free_spot(G, L, x, z, clear=0.8) or math.hypot(x - fin["x"], z - fin["z"]) < 2.0:
            continue
        if near_polyline(x, z, L["causeway"]["points"]) < 1.6:
            continue
        if rng.random() < 0.4:
            reeds(rock, x, G.y(x, z), z, rng)
            made += 1
        for j in range(3):
            px, pz = x + (rng.random() - 0.5) * 1.2, z + (rng.random() - 0.5) * 1.2
            if G.walk(px, pz):
                s = 0.06 + 0.08 * rng.random()
                angular(rock, px, G.y(px, pz), pz, s, s * 0.6, rng, "sedimentDry", "sedimentWet", sink=0.03, npts=6)
    GEO_STATS["reedClumps"] = made
    # the islet's crag: weathered blocks of limestone stacked out of the water, ferns in its ledges
    cx, cz, r, h = L["crag"]
    base = L["lake"]["water"] - 0.4
    for dx, dz, rr, hh, y0 in ((0.0, 0.0, 1.0, 1.1, 0.0), (0.25, -0.15, 0.75, 0.9, 0.9), (-0.1, 0.1, 0.55, 0.8, 1.6), (0.6, 0.45, 0.5, 0.6, 0.0)):
        lump(rock, cx + dx * r, base + y0 * h / 2.2, cz + dz * r, rr * r, hh * h / 2.2 + 0.4, rr * r * 0.85, rng, rock_colour(moss=0.45), rough=0.35, sink=0.1)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        fern(rock, cx + math.cos(a) * 0.35, base + h * (0.55 + 0.15 * k), cz + math.sin(a) * 0.35, 0.28, rng)


def build_causeway(G, L, rock, rng):
    """The stepping stones out to the Monolith's islet: flat stones along the causeway, a hand's depth
    over the water."""
    pts = L["causeway"]["points"]
    for (ax, az), (bx, bz) in zip(pts, pts[1:]):
        ln = math.hypot(bx - ax, bz - az)
        m = max(1, int(ln / 0.85))
        for j in range(m):
            t = (j + 0.5) / m
            x, z = ax + (bx - ax) * t + (rng.random() - 0.5) * 0.25, az + (bz - az) * t + (rng.random() - 0.5) * 0.25
            angular(rock, x, G.y(x, z) + 0.02, z, 0.36, 0.1, rng, "limestoneLight", "limestone", sink=0.05, squash=0.8, npts=10)
