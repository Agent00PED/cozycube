"""The Hound's Overlook: the Hound's Hand and the plateau's stalagmites (`build_overlook`), and the
overnight hearth's ring of log seats and charred logs (`build_hearth`)."""

import math
from .ground import free_spot, SURF
from .kit import blob, cyl, fan, GEO_STATS, lathe, lump, rock_colour, stalagmite


def build_overlook(G, L, rock, roots, rng):
    """The Hound's Overlook: the Explorers' Rest round its hearth (the Hound's Hand gone, docs/caverns-
    roadmap.md R10.1: the camp built where it stood); small stalagmites round the plateau's edges."""
    Tw = L["hearth"]
    for sx, sz, r, h in L["stalagmites"]:
        sy = G.y(sx, sz)
        stalagmite(rock, sx, sy, sz, r, h)
        lump(rock, sx, sy, sz, r * 1.6, 0.25, r * 1.5, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.2, sink=0.4)
    # (dry rimstone pools and low flowstone mounds over the plateau, walked through: docs/caverns-roadmap.md
    # R7.2, the plateau never a bare floor)
    made = 0
    for _ in range(400):
        if made >= 9:
            break
        px, pz = -8.0 + rng.random() * 18.0, -13.0 + rng.random() * 9.0
        if G.surf(px, pz) != SURF["overlook"] or not free_spot(G, L, px, pz, clear=1.0):
            continue
        if math.hypot(px - L["hearth"]["x"], pz - L["hearth"]["z"]) < 3.0 or math.hypot(px - Tw["x"], pz - Tw["z"]) < 4.2 or math.hypot(px - L["photo"]["x"], pz - L["photo"]["z"]) < 1.5:
            continue
        # (clear of the explorers' rest round the hearth: its tents, sacks, bedroll and lantern post)
        if any(math.hypot(px - cx, pz - cz) < 1.8 for cx, cz, _k, _y in L["campProps"]):
            continue
        py = G.y(px, pz)
        if made % 3 == 2:
            lump(rock, px, py, pz, 0.45 + 0.2 * rng.random(), 0.16, 0.38, rng, rock_colour(base="flowstone", dark="limestoneDark"), rough=0.25, sink=0.12)
        else:
            rr = 0.3 + 0.2 * rng.random()
            rings = []
            for grow, dy, col in ((0.7, -0.02, "limestoneDark"), (1.0, 0.07, "flowstone"), (1.35, 0.0, "limestone")):
                ring = []
                for j in range(12):
                    a = 2 * math.pi * j / 12
                    wob = 1 + 0.15 * math.sin(3 * a + px)
                    qx, qz = px + math.cos(a) * rr * grow * wob, pz + math.sin(a) * rr * grow * wob
                    v = rock.v(qx, G.y(qx, qz) + dy, qz)
                    rock.setv(v, col)
                    ring.append(v)
                rings.append(ring)
            for r0, r1 in zip(rings, rings[1:]):
                for j in range(12):
                    q = (j + 1) % 12
                    rock.setsmooth(rock.facing((r0[j], r0[q], r1[q], r1[j]), "flowstone", (0.0, 1.0, 0.0)))
        made += 1
    GEO_STATS["overlookPools"] = made
    build_hearth(G, L, rock, rng)


def build_hearth(G, L, rock, rng):
    """The overlook's campfire (docs/caverns-roadmap.md phase 6): a ring of river stones round a bed of
    charcoal and three charred logs leant together (the game lights the flames), four log benches
    round it facing in (a fallen log each, its top at the `log` cushion's 0.38 m: shared/seats.ts),
    and a brass plaque with a paw print on the photo spot looking back over the camp."""
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
    # (the explorers' cooking pot, docs/caverns-roadmap.md R9.3: an iron tripod over the fire, a chain
    # down from its apex, a blackened pot of stew on it and a ladle hooked on its rim; the game lets its
    # steam rise: caveWonders.tsx HearthFire)
    apex = (hx, hy + 1.35, hz)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 1.1
        cyl(rock, (hx + math.cos(a) * 0.82, hy - 0.05, hz + math.sin(a) * 0.82), apex, 0.022, "iron", sides=5)
    cyl(rock, apex, (hx, hy + 0.98, hz), 0.012, "iron", sides=4)
    lathe(rock, hx, hz, [(0.0, 0.0), (0.13, 0.01), (0.19, 0.08), (0.2, 0.17), (0.18, 0.25), (0.2, 0.27), (0.0, 0.27)], "iron", segs=12, y0=hy + 0.7)
    fan(rock, (hx, hz), [(hx + math.cos(a) * 0.17, hz + math.sin(a) * 0.17) for a in (2 * math.pi * k / 12 for k in range(12))], hy + 0.95, "stew")
    for sd in (-1, 1):
        cyl(rock, (hx + 0.2 * sd, hy + 0.96, hz), (hx, hy + 1.0, hz), 0.008, "iron", sides=3)
    cyl(rock, (hx + 0.12, hy + 0.97, hz + 0.1), (hx + 0.3, hy + 1.22, hz + 0.24), 0.012, "timber", sides=4)
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
