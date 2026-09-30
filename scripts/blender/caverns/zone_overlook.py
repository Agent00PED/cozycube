"""The Hound's Overlook: the Hound's Hand and the plateau's stalagmites (`build_overlook`), and the
overnight hearth's ring of log seats and charred logs (`build_hearth`)."""

import math
from .kit import blob, cyl, fan, hound_hand, lump, rock_colour, stalagmite


def build_overlook(G, L, rock, roots, rng):
    """The Hound's Overlook: the Hound's Hand (after Son Doong's Hand of Dog, a stalagmite whose crown
    splits into lobes like a paw) on its flowstone skirt, dithered in front of you; small stalagmites
    round the plateau's edges."""
    Tw = L["tower"]
    x, z = Tw["x"], Tw["z"]
    y = G.y(x, z)
    lump(roots, x, y, z, Tw["r"] * 1.8, 0.7, Tw["r"] * 1.6, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.2, sink=0.4)
    hound_hand(roots, x, y, z, Tw["r"], Tw["h"])
    stalagmite(roots, x + 1.2, y, z + 0.6, Tw["r"] * 0.4, Tw["h"] * 0.3)
    stalagmite(roots, x - 0.9, y, z + 1.0, Tw["r"] * 0.3, Tw["h"] * 0.18)
    for sx, sz, r, h in L["stalagmites"]:
        sy = G.y(sx, sz)
        stalagmite(rock, sx, sy, sz, r, h)
        lump(rock, sx, sy, sz, r * 1.6, 0.25, r * 1.5, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.2, sink=0.4)
    build_hearth(G, L, rock, rng)


def build_hearth(G, L, rock, rng):
    """The overlook's campfire (docs/caverns-roadmap.md phase 6): a ring of river stones round a bed of
    charcoal and three charred logs leant together (the game lights the flames), four log benches
    round it facing in (a fallen log each, its top at the `log` cushion's 0.38 m: shared/seats.ts),
    and a brass plaque with a paw print on the photo spot before the Hound's Hand."""
    H = L["hearth"]
    hx, hz, hr = H["x"], H["z"], H["r"]
    hy = G.y(hx, hz)
    # the charcoal bed, a little sunk, and the stones round it
    ring = [(hx + math.cos(a) * hr * 0.92, hz + math.sin(a) * hr * 0.92) for a in (2 * math.pi * k / 18 for k in range(18))]
    fan(rock, (hx, hz), ring, hy + 0.025, "charcoal")
    for k in range(11):
        a = 2 * math.pi * k / 11 + rng.random() * 0.2
        rr = hr + 0.06 + 0.04 * rng.random()
        sx, sz = hx + math.cos(a) * rr, hz + math.sin(a) * rr
        q = 0.11 + 0.04 * rng.random()
        lump(rock, sx, G.y(sx, sz), sz, q * 1.2, q * 0.85, q, rng, rock_colour(base="limestone", dark="limestoneDark"), rough=0.25, sink=0.3)
    # three charred logs leant into a little tepee over the bed
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        foot = (hx + math.cos(a) * hr * 0.62, hy + 0.04, hz + math.sin(a) * hr * 0.62)
        top = (hx + math.cos(a) * 0.05, hy + 0.42, hz + math.sin(a) * 0.05)
        cyl(rock, foot, top, 0.055, "charcoal", sides=7)
    for k in range(4):
        a = rng.random() * 6.283
        rr = hr * 0.5 * rng.random()
        blob(rock, hx + math.cos(a) * rr, hy + 0.04, hz + math.sin(a) * rr, 0.08, 0.035, 0.06, "charcoal", cuts=0, noise=0.2, seed=k)
    # the log benches: a fallen log under each seat, lying across the way it faces
    for s in L["hearthSeats"]:
        sx, sz, f = s["x"], s["z"], s["face"]
        tx, tz = math.cos(f), -math.sin(f)
        sy = G.y(sx, sz)
        a = (sx - tx * 0.52, sy + 0.19, sz - tz * 0.52)
        b = (sx + tx * 0.52, sy + 0.19, sz + tz * 0.52)
        cyl(rock, a, b, 0.19, "timberDark", sides=10, cap=False)
        # (its ends sawn: pale end grain over the bark)
        cyl(rock, (a[0] - tx * 0.005, a[1], a[2] - tz * 0.005), a, 0.175, "timber", sides=10, cap=True)
        cyl(rock, b, (b[0] + tx * 0.005, b[1], b[2] + tz * 0.005), 0.175, "timber", sides=10, cap=True)
        # a knot and a stub of a branch
        blob(rock, sx + tx * 0.2, sy + 0.36, sz + tz * 0.2, 0.05, 0.03, 0.05, "trunkDark", cuts=0)
    # the photo plaque: a brass disc set in the floor, a paw print in it
    P = L["photo"]
    px, pz = P["x"], P["z"]
    py = G.y(px, pz) + 0.02
    disc = [(px + math.cos(a) * 0.3, pz + math.sin(a) * 0.3) for a in (2 * math.pi * k / 20 for k in range(20))]
    fan(rock, (px, pz), disc, py, "brass")
    for dx, dz, r in ((0.0, 0.03, 0.09), (-0.1, -0.08, 0.035), (-0.035, -0.12, 0.035), (0.035, -0.12, 0.035), (0.1, -0.08, 0.035)):
        pad = [(px + dx + math.cos(a) * r, pz + dz + math.sin(a) * r) for a in (2 * math.pi * k / 10 for k in range(10))]
        fan(rock, (px + dx, pz + dz), pad, py + 0.004, "brassDark")
