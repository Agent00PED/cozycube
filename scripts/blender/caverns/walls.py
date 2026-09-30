"""The north and west limestone cliffs, leaning back as they rise and stepped by their bedding
(`wall_bed`), hollowed round the nodes set in them (`wall_point`, `wall_zones`), the Great Wall's
flowstone (`great_fold`, `build_great_curtains`), the vault's broken lip with its stalactites
(`build_vault_lip`) and the adit's bore and timbers (`build_adit`)."""

import math
from .kit import angular, box, fbm, frange, hash3, lantern, mixc, ORE_RADII, prism, smooth


# ---------------------------------------------------------------------------------------------
# the walls: the north and west limestone cliffs, leaning back as they rise (nothing overhangs, so
# nothing hangs over the view), hollowed round the nodes set in them; the adit's mouth and the
# forge's alcove open in the north wall


def wall_nodes(L):
    """The nodes set in the north and west walls: (the wall, along it, the node, its rock's size)."""
    out = []
    for nd in L["nodes"]:
        if nd["kind"] == "monolith":
            continue
        r = ORE_RADII.get(nd["kind"], 0.5)
        if nd["z"] < -21.0:
            out.append(("x", nd["x"], nd, r))
        elif nd["x"] < -21.0:
            out.append(("z", nd["z"], nd, r))
    return out


def wall_zones(along, u):
    """Which stretch of the shell a point of it faces (weights 0..1, blended over a metre or two):
    the jungle's broken rim (the collapse over the doline), the mudflats' rust-stained wall, the Great
    Wall's flowstone behind the terraces, the breakdown's fractured blocks."""
    if along == "x":
        return {"jungle": 1 - smooth(-11.0, -7.5, u), "breakdown": smooth(7.5, 10.5, u), "mud": 0.0, "great": 0.0}
    return {
        "jungle": 1 - smooth(-14.0, -10.5, u),
        "mud": smooth(-14.0, -10.5, u) * (1 - smooth(0.0, 2.5, u)),
        "great": smooth(0.0, 2.5, u) * (1 - smooth(16.0, 19.0, u)),
        "breakdown": 0.0,
    }


def wall_point(G, L, along, u, v, pockets):
    """A point of a wall's face, `u` along it and `v` up it (0 its foot, 1 its top): a damp foot
    standing in from the boundary, the face leaning back as it climbs, stepped by its bedding planes;
    over the jungle its top broken off in blocks (the collapse), behind the terraces the Great Wall's
    flowstone curtains, over the breakdown fractured into blocks; hollowed round the nodes set in it.
    Returns the point, how deep in a pocket it lies (0..1) and its stretch's weights."""
    half = L["half"]
    uc = max(-half + 0.1, min(half - 0.1, u))
    fx, fz = (uc, -half + 0.6) if along == "x" else (-half + 0.6, uc)
    foot = G.y(fx, fz) - 0.45
    zw = wall_zones(along, u)
    H = 8.6 + 1.2 * fbm(u * 0.11, 0.0, 3.0, 41)
    H += 2.6 * zw["great"]
    # (the collapse's broken lip: its top in stepped blocks, some fallen away low)
    jag = hash3(int(math.floor(u / 1.15)), 3, 7)
    H = H + (4.6 + 3.8 * jag - H) * zw["jungle"]
    y = foot + v * H
    inset = 0.58 - 0.5 * smooth(0.0, 1.0, v) + 0.2 * fbm(u * 0.3, y * 0.3, 0.7, 43) + 0.07 * fbm(u * 1.2, y * 1.1, 1.3, 47)
    # the bedding planes: a ledge every metre or so (each bed its own height), the bed above set back
    # from the one below, so every bed's top is a shelf the light from above falls on
    bed = wall_bed(u, y)
    inset += 0.32 * bed * (1 - zw["great"]) * (1 - 0.4 * zw["jungle"])
    # the Great Wall: flowstone folds down its face in sharp ridges, standing more upright, rimstone
    # ledges stepping out every metre and a half or so
    fold = great_fold(u, y)
    inset -= zw["great"] * (0.34 * fold + 0.06 * math.sin(u * 5.3 + y * 0.35))
    inset += zw["great"] * 0.3 * smooth(0.0, 1.0, v)
    gour = ((y + 0.4 * fbm(u * 0.2, 0.0, 6.5, 65)) / 1.55) % 1.0
    inset -= zw["great"] * 0.22 * smooth(0.82, 0.97, gour) * (1 - smooth(0.97, 1.0, gour))
    # the breakdown's fractured blocks
    inset += zw["breakdown"] * 0.28 * (hash3(int(math.floor(u / 1.25)), int(math.floor(y / 1.4)), 9) - 0.5)
    # (the adit's mouth set in a buttress of rock that stands forward to meet its bore)
    A = L["adit"]
    if along == "x":
        inset += 0.8 * smooth(A["w"] / 2 + 1.8, A["w"] / 2 + 0.2, abs(u - A["x"])) * (1 - smooth(0.25, 0.5, v))
    pocket = 0.0
    for al, nu, nd, r in pockets:
        if al != along:
            continue
        ny = G.y(nd["x"], nd["z"]) + r * 0.7
        R = r + 0.75
        d = math.hypot(u - nu, (y - ny) * 0.85)
        if d < R:
            t = 1 - (d / R) ** 2
            inset -= 0.85 * t
            pocket = max(pocket, smooth(0.25, 0.7, t))
    p = (u, y, -half + inset) if along == "x" else (-half + inset, y, u)
    return p, pocket, zw


def wall_bed(u, y):
    """Where (u, y) lies in its bed of the wall's bedding (0 its foot, 1 its lip): beds a metre or so
    thick, thicker and thinner along the wall, never ruled straight."""
    return ((y + 0.45 * fbm(u * 0.12, 0.0, 2.0, 49) + 0.12 * fbm(u * 0.6, 0.0, 2.4, 50)) / (1.05 + 0.25 * fbm(u * 0.05, 1.0, 2.0, 52))) % 1.0


def great_fold(u, y):
    """The Great Wall's flowstone folds at (u, y): 1 on a ridge, 0 down in a fold (sharp ridges, each its
    own width, wandering a little as they fall)."""
    ph = u * 2.4 + 1.3 * fbm(u * 0.4, y * 0.15, 5.0, 57)
    return 1.0 - abs(math.sin(ph)) ** 0.6


def wall_colour(u, y, v, pocket, zw):
    band = 0.5 + 0.5 * math.sin(y * 3.1 + fbm(u * 0.2, y * 0.2, 0.0, 51) * 2.5)
    c = mixc("limestoneDark", "limestone", 0.15 + 0.7 * band)
    # (each bed's lip pale where the light catches it, the shadowed recess under the bed above dark)
    bed = wall_bed(u, y)
    plain = (1 - zw["great"]) * (1 - 0.5 * zw["jungle"])
    c = mixc(c, "limestoneLight", smooth(0.72, 0.97, bed) * 0.45 * plain)
    c = mixc(c, "strataDark", smooth(0.22, 0.0, bed) * 0.55 * plain)
    c = mixc(c, "limestoneLight", smooth(0.35, 0.8, fbm(u * 0.5, y * 0.5, 2.0, 53)) * 0.35)
    c = mixc(c, "strataDark", smooth(0.3, 0.6, fbm(u * 1.4, y * 2.6, 4.0, 55)) * 0.3)
    # the Great Wall's flowstone: warm cream banded amber down its folds (Son Doong's "bacon"), the
    # folds shadowed, never a glare of white
    streak = smooth(0.2, 0.7, fbm(u * 1.3, y * 0.12, 6.0, 59))
    fold = great_fold(u, y)
    g = mixc("greatCream", "greatAmber", 0.2 + 0.55 * streak)
    g = mixc(g, "greatShadow", (1 - fold) * 0.55)
    c = mixc(c, g, zw["great"] * 0.95)
    # the mudflats' wall: rust bleeding down it
    rust = smooth(0.25, 0.65, fbm(u * 1.7, y * 0.14, 8.0, 61))
    c = mixc(c, mixc("mudRock", "rustDark", 0.4 * band), zw["mud"] * rust * 0.75)
    # the jungle's rim: moss where the light falls, thickest up at the broken lip and down at the foot
    moss = smooth(0.15, 0.55, fbm(u * 0.6, y * 0.45, 3.0, 63)) * (0.45 + 0.55 * max(smooth(0.55, 0.95, v), smooth(0.25, 0.0, v)))
    c = mixc(c, mixc("mossDeep", "moss", band), zw["jungle"] * moss * 0.85)
    # the breakdown's fresh fractures: paler
    c = mixc(c, "limestoneLight", zw["breakdown"] * 0.3 * hash3(int(math.floor(u / 1.25)), int(math.floor(y / 1.4)), 11))
    c = mixc(c, "wallFoot", smooth(0.22, 0.0, v) * 0.85)
    c = mixc(c, "vault", smooth(0.75, 1.0, v) * 0.6 * (1 - zw["jungle"]))
    return mixc(c, "vug", pocket)


def build_walls(G, L, shell, glow, rng):
    half = L["half"]
    A, F = L["adit"], L["forge"]
    ady = G.y(A["x"], -half + 1.0)
    fdy = G.y(F["x"], F["z"])
    hw = A["w"] / 2
    pockets = wall_nodes(L)
    V = 38
    us = frange(-half - 1.0, half + 0.5, 0.45)
    for along in ("x", "z"):
        grid = []
        for u in us:
            col = []
            for j in range(V + 1):
                p, pk, zw = wall_point(G, L, along, u, j / V, pockets)
                vv = shell.v(*p)
                shell.setv(vv, wall_colour(u, p[1], j / V, pk, zw))
                col.append(vv)
            grid.append(col)
        for a in range(len(us) - 1):
            um = (us[a] + us[a + 1]) / 2
            for j in range(V):
                if along == "x":
                    ym = (grid[a][j].co.z + grid[a][j + 1].co.z) / 2
                    # (the adit's arch and the forge's alcove open in the north wall)
                    if abs(um - A["x"]) < hw + 0.15 and ym < ady + A["h"] + 0.1 - (0.0 if abs(um - A["x"]) < hw * 0.6 else 0.35):
                        continue
                    if abs(um - F["x"]) < F["w"] / 2 + 0.25 - 0.12 * max(0.0, ym - fdy - F["h"]) and ym < fdy + F["h"] + 1.4:
                        continue
                q = (grid[a][j], grid[a + 1][j], grid[a + 1][j + 1], grid[a][j + 1])
                f = shell.face(q if along == "x" else tuple(reversed(q)), "limestone")
                # (the Great Wall's folds faceted, crisp, in their own cream colours; the rest of the
                # shell smooth)
                if along == "x" or wall_zones(along, um)["great"] < 0.5:
                    shell.setsmooth(f)
                else:
                    shell.setpainted(f)
    # the vugs' crystals: amethyst and cyan growing round each pocket's rim, out of the dark
    for al, nu, nd, r in pockets:
        floor_y = G.y(nd["x"], nd["z"])
        ny = floor_y + r * 0.7
        R = r + 0.55
        for k in range(7):
            a = 2 * math.pi * k / 7 + rng.random() * 0.5
            du, dy = math.cos(a) * R, math.sin(a) * R * 1.1
            if ny + dy < floor_y + 0.05:
                continue
            if al == "x":
                base, d = (nu + du, ny + dy, -half + 0.2), (math.cos(a) * 0.3, 0.4 + 0.3 * math.sin(a), 0.9)
            else:
                base, d = (-half + 0.2, ny + dy, nu + du), (0.9, 0.4 + 0.3 * math.sin(a), math.cos(a) * 0.3)
            colr = "violet" if (k + int(nu)) % 3 == 0 else "cyan"
            prism(glow, base, d, 0.035 + 0.025 * rng.random(), 0.22 + 0.25 * rng.random(), colr, sides=5)


def build_vault_lip(G, L, shell, rng):
    """The vault's broken lip along the tops of the north and west walls (never over the jungle's
    collapse, which is open): blocks of rock breaking off the wall's top edge, leaning out a little,
    and stalactites hanging from under them in clusters, the longest a metre and a half, all of it
    high over the walls' feet and never out over the floor you walk."""
    pockets = wall_nodes(L)
    for along in ("x", "z"):
        u = -L["half"] + 0.4
        while u < L["half"] - 0.2:
            step = 0.9 + 0.7 * rng.random()
            zw = wall_zones(along, u)
            if zw["jungle"] > 0.35:
                u += step
                continue
            (px, py, pz), _, _ = wall_point(G, L, along, u, 1.0, pockets)
            out = (0.0, 0.0, 1.0) if along == "x" else (1.0, 0.0, 0.0)
            reach = 0.25 + 0.55 * rng.random()
            cx, cz = px + out[0] * reach * 0.5, pz + out[2] * reach * 0.5
            r = 0.45 + 0.4 * rng.random()
            top = "vault" if zw["great"] < 0.5 else "greatShadow"
            angular(shell, cx, py - 0.55 - 0.3 * rng.random(), cz, r, 0.7 + 0.5 * rng.random(), rng, top, "limestoneDark" if zw["great"] < 0.5 else mixc("greatCream", "greatShadow", 0.35), sink=0.0, npts=10)
            # (a cluster of stalactites under the block, the longest in the middle, dripping)
            if rng.random() < 0.7:
                n = 2 + int(rng.random() * 3)
                for k in range(n):
                    sx = cx + out[0] * (0.1 + 0.3 * rng.random()) + (rng.random() - 0.5) * (0.8 if along == "x" else 0.25)
                    sz = cz + out[2] * (0.1 + 0.3 * rng.random()) + (rng.random() - 0.5) * (0.25 if along == "x" else 0.8)
                    ln = (0.35 + 1.1 * rng.random()) * (1.0 if k == 0 else 0.65)
                    base_y = py - 0.5 - 0.2 * rng.random()
                    col = "limestoneLight" if zw["great"] < 0.5 else "greatCream"
                    prism(shell, (sx, base_y, sz), (0.04 * (rng.random() - 0.5), -1.0, 0.04 * (rng.random() - 0.5)), 0.07 + 0.08 * rng.random() * (1.0 if k == 0 else 0.6), ln, col, sides=6, tip=0.7)
            u += step


def build_great_curtains(G, L, rock, rng):
    """Flowstone curtains hung down the Great Wall behind the terraces: thin draped sheets from ledges
    high up, folded like cloth, banded cream and amber, their hems scalloped (double sided)."""
    half = L["half"]
    for zc, top, drop, width in ((1.8, 7.8, 3.6, 1.6), (4.6, 8.8, 4.4, 1.9), (7.8, 7.2, 3.0, 1.4), (10.6, 9.2, 4.8, 2.0), (13.6, 7.9, 3.4, 1.7), (16.6, 8.5, 3.9, 1.5)):
        fy = G.y(-half + 1.2, zc)
        y0 = fy + top
        n = 14
        rows = 6
        front, back = [], []
        for r in range(rows + 1):
            t = r / rows
            fr, bk = [], []
            for k in range(n + 1):
                w = k / n
                z = zc - width / 2 + width * w
                # (the hem: longer down the middle, scalloped between the folds)
                hem = drop * (0.75 + 0.25 * math.sin(math.pi * w)) * (0.9 + 0.1 * abs(math.sin(k * 1.7)))
                y = y0 - hem * t
                fold = abs(math.sin(k * math.pi / 2.0))
                x = -half + 0.55 + 0.18 * fold + 0.1 * t + 0.05 * math.sin(r * 1.3 + k)
                # (cream, a warmer amber toward the hem, a little shadow down in each fold)
                col = mixc(mixc("greatCream", "greatAmber", 0.15 + 0.45 * t), "greatShadow", (1 - fold) * 0.22)
                v = rock.v(x, y, z)
                rock.setv(v, col)
                fr.append(v)
                vb = rock.v(x - 0.03, y, z)
                rock.setv(vb, mixc(col, "greatShadow", 0.4))
                bk.append(vb)
            front.append(fr)
            back.append(bk)
        for r in range(rows):
            for k in range(n):
                rock.face((front[r][k], front[r + 1][k], front[r + 1][k + 1], front[r][k + 1]), "greatCream")
                rock.face((back[r][k + 1], back[r + 1][k + 1], back[r + 1][k], back[r][k]), "greatShadow")


def build_adit(G, L, rock, glow):
    """The old mine adit up to the woods: its dark bore into the hill, timber sets propping its mouth
    with lagging over their caps, its rails on sleepers, a lantern hung from the first cap."""
    half = L["half"]
    A = L["adit"]
    hw = A["w"] / 2
    ady = G.y(A["x"], -half + 1.0)
    spring = ady + A["h"] - hw
    prof = [(-hw, ady - 0.1), (-hw, spring)] + [(-hw * math.cos(math.pi * k / 6), spring + hw * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(hw, spring), (hw, ady - 0.1)]
    depths = [-half + 1.1, -half - 0.4, -half - 1.8, -half - 3.2]
    rings = []
    for j, zz in enumerate(depths):
        ring = []
        for px, py in prof:
            v = rock.v(A["x"] + px * (1 - 0.06 * j), py, zz)
            rock.setv(v, mixc("stoneDark", "tunnel", j / (len(depths) - 1) * 1.2))
            ring.append(v)
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(len(prof) - 1):
            rock.setsmooth(rock.face((r0[k + 1], r0[k], r1[k], r1[k + 1]), "tunnel"))
    rock.face(list(reversed(rings[-1])), "tunnel")
    for j, zz in enumerate((-half + 0.9, -half - 0.5, -half - 1.9)):
        sp = 0.06 * j
        for sx in (-1, 1):
            px = A["x"] + sx * (hw - 0.05 - sp)
            box(rock, px - 0.1, px + 0.1, ady - 0.1, spring + 0.25, zz - 0.1, zz + 0.1, "timber" if j == 0 else "timberDark")
        box(rock, A["x"] - hw - 0.12 + sp, A["x"] + hw + 0.12 - sp, spring + 0.22, spring + 0.42, zz - 0.12, zz + 0.12, "timberDark")
    for k in range(6):
        zz = -half + 0.95 - k * 0.42
        box(rock, A["x"] - hw + 0.1, A["x"] + hw - 0.1, spring + 0.42, spring + 0.48, zz - 0.17, zz + 0.17, "plank" if k % 2 else "timber", bottom=False)
    # (the track: sleepers and two rails, from the dark out to the mouth)
    for k in range(9):
        zz = -half - 2.8 + k * 0.62
        box(rock, A["x"] - 0.62, A["x"] + 0.62, ady - 0.02, ady + 0.04, zz - 0.09, zz + 0.09, "timberDark", bottom=False)
    for sx in (-0.42, 0.42):
        box(rock, A["x"] + sx - 0.03, A["x"] + sx + 0.03, ady + 0.04, ady + 0.1, -half - 3.0, -half + 2.8, "steel", bottom=False)
    lantern(rock, glow, A["x"] + hw - 0.3, spring + 0.35, -half + 1.02, hang=0.36)
