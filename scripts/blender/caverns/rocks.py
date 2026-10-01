"""The rock between the zones' own art: the boulders and the host rock of every node that stands free
in its zone's colours (`build_blockout_rocks`), and the empty stretches dressed with walked-through
things (`build_dressing`: nubs and rubble, shards and fungi, driftwood, reeds and pebbles)."""

import math
from .ground import free_spot, inside_poly, lake_factor, near_polyline, SURF
from .waters import pool_outline
from .kit import (
    angular, crystal_cluster, cyl, fungi, GEO_STATS, ORE_RADII, prism, reeds, stalagmite,
)


def build_dressing(G, L, rock, glow, rng):
    """The empty stretches dressed (docs/caverns-roadmap.md 1.10), with walked-through things only: the
    overlook's flowstone nubs and rubble, the rift floor's crystal shards and fungi, driftwood, reeds
    and pebbles along the lake's south and east shores, and rubble strewn over the bare slopes between
    the levels (the banks too steep to walk), so no stretch of ground lies flat and empty."""
    made = {"nubs": 0, "shards": 0, "drift": 0, "slope": 0}
    tries = 0
    # the overlook: little flowstone stalagmites and rubble over the plateau
    while made["nubs"] < 26 and tries < 900:
        tries += 1
        x, z = -8.5 + rng.random() * 19.0, -13.0 + rng.random() * 9.8
        if G.surf(x, z) != SURF["overlook"] or not free_spot(G, L, x, z, clear=0.5):
            continue
        if math.hypot(x - L["hearth"]["x"], z - L["hearth"]["z"]) < 4.0:
            continue
        y = G.y(x, z)
        if made["nubs"] % 3 == 0:
            stalagmite(rock, x, y - 0.05, z, 0.08 + 0.06 * rng.random(), 0.22 + 0.3 * rng.random())
        else:
            angular(rock, x, y, z, 0.12 + 0.12 * rng.random(), 0.1, rng, "limestoneLight", "limestone", sink=0.05, npts=7)
        made["nubs"] += 1
    # the rift's floor: crystal shards pushing up through the black rock, and glowing fungi
    tries = 0
    while made["shards"] < 22 and tries < 900:
        tries += 1
        x, z = 12.5 + rng.random() * 9.6, -11.0 + rng.random() * 15.5
        if G.surf(x, z) != SURF["rift"] or not free_spot(G, L, x, z, clear=0.5):
            continue
        y = G.y(x, z)
        if made["shards"] % 3 == 2:
            fungi(rock, glow, x, y, z, 0.5 + 0.3 * rng.random(), rng)
        else:
            for k in range(3):
                a = rng.random() * 2 * math.pi
                prism(glow, (x + math.cos(a) * 0.06, y - 0.02, z + math.sin(a) * 0.06), (math.cos(a) * 0.5, 1.0, math.sin(a) * 0.5), 0.025 + 0.015 * rng.random(), 0.12 + 0.14 * rng.random(), "cyanSoft" if (k + made["shards"]) % 3 else "violetSoft", sides=4)
            angular(rock, x, y, z, 0.14, 0.08, rng, "basaltTop", "basaltCol", sink=0.05, npts=7)
        made["shards"] += 1
    # the lake's south and east shores: driftwood bleached pale, reeds, pebbles
    tries = 0
    while made["drift"] < 24 and tries < 1400:
        tries += 1
        x, z = -4.0 + rng.random() * 25.0, 3.0 + rng.random() * 18.5
        f = lake_factor(L, x, z)
        if f < 1.02 or f > 1.5 or not free_spot(G, L, x, z, clear=0.5):
            continue
        y = G.y(x, z)
        k = made["drift"] % 4
        if k == 0:
            a = rng.random() * math.pi
            ln = 0.6 + 0.6 * rng.random()
            cyl(rock, (x - math.cos(a) * ln / 2, y + 0.06, z - math.sin(a) * ln / 2), (x + math.cos(a) * ln / 2, y + 0.08, z + math.sin(a) * ln / 2), 0.07, "driftPale", sides=5, r_end=0.05)
            cyl(rock, (x, y + 0.07, z), (x + math.cos(a + 1.2) * 0.3, y + 0.12, z + math.sin(a + 1.2) * 0.3), 0.025, "driftPale", sides=4, r_end=0.012)
        elif k == 1:
            reeds(rock, x, y, z, rng)
        else:
            for j in range(3):
                a = rng.random() * 2 * math.pi
                angular(rock, x + math.cos(a) * 0.2, y, z + math.sin(a) * 0.2, 0.07 + 0.05 * rng.random(), 0.05, rng, "pebble", "pebbleDark", sink=0.02, npts=6)
        made["drift"] += 1
    # rubble over the bare slopes between the levels (never on a cliff's face, never in the water)
    tries = 0
    while made["slope"] < 60 and tries < 3000:
        tries += 1
        x, z = -21.0 + rng.random() * 42.0, -12.0 + rng.random() * 32.0
        if G.walk(x, z) or lake_factor(L, x, z) < 1.1:
            continue
        gx = G.y(x + 0.25, z) - G.y(x - 0.25, z)
        gz = G.y(x, z + 0.25) - G.y(x, z - 0.25)
        grad = math.hypot(gx, gz) / 0.5
        if grad < 0.45 or grad > 1.3 or G.y(x, z) < -0.3:
            continue
        if any(near_polyline(x, z, p["points"]) < p["half"] + 0.5 for p in L["paths"]):
            continue
        # (never in a pool's bowl, the stream's channel or the plunge pool, under their water)
        Rv = L["river"]
        if any(near_polyline(x, z, seg) < Rv["half"] + 0.4 for seg in Rv["segments"]) or math.hypot(x - Rv["plunge"]["x"], z - Rv["plunge"]["z"]) < Rv["plunge"]["r"] + 0.5:
            continue
        if any(inside_poly(x, z, pool_outline(L, pl, grow=0.4)[1]) for pl in L["terraces"]["pools"]):
            continue
        top, side = zone_rock(G, x, z)
        r = 0.1 + 0.16 * rng.random()
        angular(rock, x, G.y(x, z), z, r, r * 0.7, rng, top, side, sink=0.08, npts=7)
        made["slope"] += 1
    GEO_STATS["dressing"] = made


# ---------------------------------------------------------------------------------------------
# the blockout's rock: the boulders, the host rock of every node that stands free, the rift's crystals
# and fungi, each in its zone's colours (the zones' own rock comes in their own phases)

ROCK_BY_SURF = {
    0: ("limestone", "limestoneDark"),
    1: ("moss", "limestoneDark"),
    2: ("limestoneLight", "limestone"),
    3: ("mudRock", "mudRockDark"),
    4: ("limestoneLight", "limestone"),
    5: ("travRock", "travRockDark"),
    6: ("basaltTop", "basaltCol"),
}


def zone_rock(G, x, z):
    return ROCK_BY_SURF.get(G.surf(x, z), ("limestone", "limestoneDark"))


def build_blockout_rocks(G, L, rock, glow, rng):
    for x, z, r in L["boulders"]:
        top, side = zone_rock(G, x, z)
        angular(rock, x, G.y(x, z), z, r, r * 1.05, rng, top, side, sink=0.2, npts=14)
    # the host rock behind every node that stands free (nodeBackRock)
    for nd in L["nodes"]:
        if nd["kind"] in ("monolith", "rockfall") or nd["z"] < -21.2 or nd["x"] < -21.2:
            continue
        r = ORE_RADII.get(nd["kind"], 0.5)
        fx, fz = nd["face"]
        fl = math.hypot(fx, fz) or 1.0
        bx, bz = nd["x"] - fx / fl * (r + 0.45), nd["z"] - fz / fl * (r + 0.45)
        top, side = zone_rock(G, bx, bz)
        angular(rock, bx, G.y(bx, bz), bz, r + 0.35, r * 1.8, rng, top, side, sink=0.25, npts=14)
    for x, z, s in L["crystals"]:
        crystal_cluster(glow, rock, x, G.y(x, z), z, s, rng)
    for x, z, s in L["shrooms"]:
        fungi(rock, glow, x, G.y(x, z), z, s, rng)
