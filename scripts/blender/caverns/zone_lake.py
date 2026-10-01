"""The Great Lake's shore: reeds and pebbles at the waterline and the islet's crag, the raft that poles
across to the islet (`build_raft`: `Prop_Raft`, moved by the game) (`build_lake_shore`), and the
stepping stones out to the Monolith (`build_causeway`)."""

import math
from .ground import free_spot, lake_factor, near_polyline
from .scene import finish_object
from .zone_basecamp import pivot_object
from .kit import angular, blob, box, broken_slab, menhir, crystal_cluster, cyl, fern, GEO_STATS, hullbox, lantern, lump, Mesh, prism, reeds, rock_colour, slab, turned


def build_raft(G, L, coll):
    """The raft on the Great Lake (docs/caverns-roadmap.md R2.10): five logs lashed across two
    crosspieces, a pole laid along it, a lantern on a short post at its stern; its own object
    (`Prop_Raft`), its origin at the middle of its deck on the water, its length along the game's z
    (the game floats it from landing to landing and turns it to its heading). Built where it rests by
    the north shore."""
    rv = L["raft"]["via"]
    x, z = rv[0]
    y = L["lake"]["water"]
    raft = Mesh("CV_Clay")
    for k in range(5):
        ox = -0.48 + 0.24 * k
        cyl(raft, (x + ox, y + 0.02, z - 0.85), (x + ox, y + 0.02, z + 0.85), 0.11, "raftLog", sides=6)
    for oz in (-0.55, 0.55):
        box(raft, x - 0.62, x + 0.62, y + 0.12, y + 0.17, z + oz - 0.06, z + oz + 0.06, "timberDark")
    cyl(raft, (x - 0.3, y + 0.16, z - 0.9), (x + 0.2, y + 0.18, z + 1.4), 0.025, "timber", sides=4)
    cyl(raft, (x + 0.45, y + 0.13, z - 0.7), (x + 0.45, y + 0.75, z - 0.7), 0.03, "timber", sides=4)
    lantern(raft, raft, x + 0.45, y + 0.75, z - 0.7, hang=0.12)
    pivot_object(finish_object("Prop_Raft", raft, coll), (x, y, z))


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


def build_monolith_dais(G, L, rock, glow, rng):
    """The Titan Monolith's place (docs/caverns-roadmap.md R3.5), built into the islet so it stands
    whether the Monolith is up or broken: a stepped dais of worn basalt (three uneven tiers, runes
    carved glowing in the middle tier's risers, moss in the cracks), the shaft seated in a socket of
    packed rubble; a rune circle engraved in the islet's floor round it; a ring of broken standing
    stones about the islet's edge, one fallen, a glyph on each; violet crystal breaking out of the
    ground round the dais (never on the way to the mining spot)."""
    M = next(n for n in L["nodes"] if n["id"] == "monolith")
    R = L["monolithRing"]
    mx, mz = M["x"], M["z"]
    gy = G.y(mx, mz)
    face = math.atan2(M["face"][1], M["face"][0])

    def outline(r, sides, jit, seed):
        out = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + 0.2 * seed
            rr = r * (1 + jit * math.sin(k * 2.3 + seed) + 0.5 * jit * math.sin(k * 5.1 + seed * 2))
            out.append((mx + rr * math.cos(a), mz + rr * math.sin(a) * 0.95))
        return out

    tiers = ((1.2, gy - 0.12, gy + 0.07, 9, "basalt", "basaltTop"), (0.98, gy + 0.07, gy + 0.2, 8, "basaltDeep", "basaltTop"), (0.76, gy + 0.2, gy + 0.3, 7, "basalt", "basaltLight"))
    for i, (r, y0, y1, sides, side, top) in enumerate(tiers):
        ol = outline(r, sides, 0.05, i * 1.7)
        slab(rock, ol, y0, y1, side, top=top, bottom=False)
        if i == 1:
            # (runes carved in the middle tier's risers: a glyph of glowing strokes on each face)
            for k in range(sides):
                (ax, az), (bx, bz) = ol[k], ol[(k + 1) % sides]
                cx, cz = (ax + bx) / 2, (az + bz) / 2
                ox, oz = cx - mx, cz - mz
                on = math.hypot(ox, oz) or 1.0
                ox, oz = ox / on * 0.012, oz / on * 0.012
                tx, tz = (bx - ax), (bz - az)
                tn = math.hypot(tx, tz) or 1.0
                tx, tz = tx / tn, tz / tn
                yc = (y0 + y1) / 2
                strokes = (((-0.05, -0.04), (-0.05, 0.04)), ((-0.05, 0.04), (0.02, -0.04)), ((0.05, -0.04), (0.05, 0.04))) if k % 2 else (((-0.05, 0.0), (0.05, 0.0)), ((0.0, -0.04), (0.0, 0.04)), ((-0.04, -0.04), (0.04, 0.04)))
                for (u0, v0), (u1, v1) in strokes:
                    cyl(glow, (cx + ox + tx * u0, yc + v0, cz + oz + tz * u0), (cx + ox + tx * u1, yc + v1, cz + oz + tz * u1), 0.008, "runeGlow", sides=3)
        # (moss in the cracks at each tier's foot, here and there)
        for k in range(sides):
            if rng.random() < 0.45:
                x, z = ol[k]
                blob(rock, x + (mx - x) * 0.04, y1 - 0.01 if i else y1, z + (mz - z) * 0.04, 0.07 + 0.05 * rng.random(), 0.02, 0.06, "mossDeep" if k % 2 else "moss", cuts=1)
    # the socket: rubble packed round the shaft's foot on the top tier
    for k in range(11):
        a = 2 * math.pi * k / 11 + rng.random() * 0.4
        rr = 0.6 + 0.1 * rng.random()
        angular(rock, mx + math.cos(a) * rr, gy + 0.28, mz + math.sin(a) * rr * 0.9, 0.09 + 0.05 * rng.random(), 0.1 + 0.06 * rng.random(), rng, "basaltTop", "basalt", sink=0.03, npts=7)
    # the rune circle engraved in the islet's floor, broken into arcs with a glyph between each
    rr = R["circle"]
    arcs = 8
    for k in range(arcs):
        a0 = 2 * math.pi * k / arcs + 0.08
        a1 = 2 * math.pi * (k + 1) / arcs - 0.08
        prev = None
        for j in range(7):
            a = a0 + (a1 - a0) * j / 6
            x, z = mx + math.cos(a) * rr, mz + math.sin(a) * rr
            y = G.y(x, z) + 0.012
            pair = (glow.v(x + math.cos(a) * 0.025, y, z + math.sin(a) * 0.025), glow.v(x - math.cos(a) * 0.025, y, z - math.sin(a) * 0.025))
            if prev:
                glow.facing((prev[0], prev[1], pair[1], pair[0]), "runeGlow", (0.0, 1.0, 0.0))
            prev = pair
        a = 2 * math.pi * (k + 1) / arcs
        x, z = mx + math.cos(a) * rr, mz + math.sin(a) * rr
        y = G.y(x, z) + 0.014
        tx, tz = -math.sin(a), math.cos(a)
        for (u0, v0), (u1, v1) in (((-0.06, -0.05), (0.06, 0.05)), ((-0.06, 0.05), (0.06, -0.05))) if k % 2 else (((0.0, -0.07), (0.0, 0.07)), ((-0.05, 0.0), (0.05, 0.0))):
            p0 = (x + tx * u0 + math.cos(a) * v0, y, z + tz * u0 + math.sin(a) * v0)
            p1 = (x + tx * u1 + math.cos(a) * v1, y, z + tz * u1 + math.sin(a) * v1)
            dx, dz = p1[0] - p0[0], p1[2] - p0[2]
            dn = math.hypot(dx, dz) or 1.0
            wx, wz = -dz / dn * 0.018, dx / dn * 0.018
            glow.facing((glow.v(p0[0] + wx, y, p0[2] + wz), glow.v(p1[0] + wx, y, p1[2] + wz), glow.v(p1[0] - wx, y, p1[2] - wz), glow.v(p0[0] - wx, y, p0[2] - wz)), "runeGlow", (0.0, 1.0, 0.0))
    # the standing stones about the islet's edge, broken off at their tops, one fallen
    for deg, h, fallen in R["stones"]:
        a = math.radians(deg)
        x, z = mx + math.cos(a) * R["r"], mz + math.sin(a) * R["r"]
        y = min(G.y(x, z), gy)
        if fallen:
            broken_slab(rock, (x, y + 0.14, z), turned(a + math.pi / 2, roll=0.25, pitch=0.08), 0.62, 0.14, 0.22, rng, top="basaltTop", side="basalt", under="basaltDeep")
            continue
        # (a weathered menhir: a fractured tall block, its top broken off ragged)
        menhir(rock, x, y, z, 0.34, 0.2, h, a + math.pi / 2 + 0.2 * (rng.random() - 0.5), rng, "basaltLight", "basalt")
        # (a glyph on its face toward the Monolith)
        ix, iz = -math.cos(a), -math.sin(a)
        fx, fz = x + ix * 0.25, z + iz * 0.25
        tx, tz = -iz, ix
        yc = y + h * 0.55
        for (u0, v0), (u1, v1) in (((0.0, -0.12), (0.0, 0.12)), ((0.0, 0.05), (0.08, 0.12)), ((0.0, -0.05), (-0.08, -0.12))):
            cyl(glow, (fx + tx * u0, yc + v0, fz + tz * u0), (fx + tx * u1, yc + v1, fz + tz * u1), 0.011, "runeGlow", sides=3)
    # violet crystal breaking out of the ground round the dais, clear of the way to the mining spot
    made = 0
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.3
        if abs((a - face + math.pi) % (2 * math.pi) - math.pi) < 0.8:
            continue
        rr2 = 1.38 + 0.2 * rng.random()
        x, z = mx + math.cos(a) * rr2, mz + math.sin(a) * rr2
        if lake_factor(L, x, z) < 1.0 and G.y(x, z) < 0.0:
            continue
        if made % 2 == 0:
            crystal_cluster(glow, rock, x, G.y(x, z), z, 0.42 + 0.15 * rng.random(), rng)
        else:
            for j in range(3):
                b = rng.uniform(0, 2 * math.pi)
                prism(glow, (x + math.cos(b) * 0.06, G.y(x, z) - 0.02, z + math.sin(b) * 0.06), (math.cos(b) * 0.5, 1.0, math.sin(b) * 0.5), 0.035 + 0.02 * rng.random(), 0.2 + 0.2 * rng.random(), "violet" if j % 2 else "violetSoft", sides=5)
        made += 1
    GEO_STATS["monolithCrystals"] = made
