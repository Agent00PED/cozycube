"""The Expedition Basecamp: Gus's camp under its tarp (`build_camp`), the Basalt Crucible Forge and its
workshop carried over exactly as they were built (`build_forge_alcove`), the camp's gear
(`build_basecamp_gear`) and Gus's winch at the breakdown's edge with its moving cage, rope and drum
(`build_winch`, `pivot_object`)."""

import math
import random

from mathutils import Vector
from .kit import (
    angular, blob, box, chunk, cyl, game_point, lantern, lathe, Mesh, prism_col, tarp, W,
)
from .scene import finish_object


# ---------------------------------------------------------------------------------------------
# the Expedition Basecamp


def build_camp(G, L, rock, glow):
    Wk = L["workstation"]
    wy = G.y(Wk["x"], Wk["z"])
    Cp = L["camp"]
    # Gus's log workstation (the counter he trades over): a log on two stumps, a plank top, his finds
    for sx in (-1, 1):
        cyl(rock, (Wk["x"] + sx * Wk["len"] * 0.36, wy - 0.05, Wk["z"]), (Wk["x"] + sx * Wk["len"] * 0.36, wy + Wk["top"] - 0.16, Wk["z"]), 0.22, "timberDark", sides=9)
    cyl(rock, (Wk["x"] - Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), (Wk["x"] + Wk["len"] / 2, wy + Wk["top"] - 0.1, Wk["z"]), Wk["w"] * 0.5, "timber", sides=9)
    box(rock, Wk["x"] - Wk["len"] / 2 + 0.05, Wk["x"] + Wk["len"] / 2 - 0.05, wy + Wk["top"] - 0.12, wy + Wk["top"], Wk["z"] - Wk["w"] * 0.42, Wk["z"] + Wk["w"] * 0.42, "plank", bottom=False)
    for k, colr in enumerate(("copperNug", "silverVein", "coalChunk", "copperNug")):
        blob(rock, Wk["x"] - 0.42 + k * 0.1, wy + Wk["top"] + 0.05, Wk["z"] - 0.02, 0.04, 0.035, 0.04, colr, cuts=0)
    box(rock, Wk["x"] + 0.3, Wk["x"] + 0.62, wy + Wk["top"], wy + Wk["top"] + 0.03, Wk["z"] - 0.12, Wk["z"] + 0.12, "leather")
    # the tarp shelter: four weathered posts, a ridge beam and eaves, the canvas over them
    posts = Cp["posts"]
    tops = []
    for k, (px, pz) in enumerate(posts):
        py = G.y(px, pz)
        ht = Cp["ridge"] if k < 2 else Cp["eave"]
        cyl(rock, (px, py - 0.1, pz), (px, py + ht, pz), 0.07, "timber" if k % 2 else "timberDark", sides=6)
        tops.append((px, py + ht, pz))
    cyl(rock, tops[0], tops[1], 0.06, "timberDark", sides=6)
    cyl(rock, tops[2], tops[3], 0.05, "timber", sides=6)
    for a, b in ((0, 2), (1, 3)):
        cyl(rock, tops[a], tops[b], 0.045, "timber", sides=5)
    tarp(rock, [(tops[0][0] - 0.25, tops[0][1] + 0.08, tops[0][2] + 0.2), (tops[1][0] + 0.25, tops[1][1] + 0.08, tops[1][2] + 0.2), (tops[3][0] + 0.25, tops[3][1] + 0.05, tops[3][2] - 0.25), (tops[2][0] - 0.25, tops[2][1] + 0.05, tops[2][2] - 0.25)], 0.16, "canvas", "canvasShade")
    for t in (0.22, 0.78):
        lantern(rock, glow, tops[0][0] + (tops[1][0] - tops[0][0]) * t, tops[0][1] - 0.06, tops[0][2], hang=0.28)
    # the crate stack, iron-strapped, its specimen jars glowing with their finds
    cx, cz = Cp["crates"]
    cy = G.y(cx, cz)
    for dx, dz, w, d, h, y0 in ((-0.2, 0.0, 0.55, 0.5, 0.45, 0.0), (0.28, 0.02, 0.45, 0.45, 0.4, 0.0), (-0.12, 0.02, 0.5, 0.45, 0.38, 0.45)):
        x0, z0 = cx + dx - w / 2, cz + dz - d / 2
        box(rock, x0, x0 + w, cy + y0 - 0.02, cy + y0 + h, z0, z0 + d, "timber", top="plank")
        for sx in (0.12, w - 0.12):
            box(rock, x0 + sx - 0.025, x0 + sx + 0.025, cy + y0 - 0.02, cy + y0 + h + 0.004, z0 - 0.004, z0 + d + 0.004, "iron")
    jy = cy + 0.83
    for k, g in enumerate(("cyan", "copperGlow", "violet")):
        jx = cx - 0.3 + k * 0.17
        lathe(rock, jx, cz + 0.08, [(0, 0), (0.05, 0.0), (0.055, 0.12), (0.035, 0.15), (0, 0.16)], "glass", segs=7, y0=jy)
        blob(glow, jx, jy + 0.06, cz + 0.08, 0.03, 0.04, 0.03, g, cuts=0)
    # the brass survey transit on its tripod, sighting down the doline
    tx, tz = Cp["transit"]
    ty = G.y(tx, tz)
    head = (tx, ty + 1.15, tz)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        cyl(rock, (tx + math.cos(a) * 0.42, ty - 0.05, tz + math.sin(a) * 0.42), head, 0.02, "timber", sides=5)
    box(rock, tx - 0.07, tx + 0.07, ty + 1.12, ty + 1.2, tz - 0.07, tz + 0.07, "brassDark")
    cyl(rock, (tx, ty + 1.2, tz), (tx, ty + 1.3, tz), 0.035, "brass", sides=8)
    cyl(rock, (tx - 0.02, ty + 1.34, tz - 0.16), (tx + 0.02, ty + 1.36, tz + 0.2), 0.035, "brass", sides=8)


# ---------------------------------------------------------------------------------------------
# the Basalt Crucible Forge and its flagstone workshop: carried over exactly as they were built


def build_forge_alcove(G, L, rock, glow, water, rng):
    half = L["half"]
    F = L["forge"]
    # the Basalt Crucible Forge: columnar basalt stepping up round the cleft in the north wall; in the
    # cleft a deep combustion chamber carved into the columns, embers glowing at its foot and its heat
    # rising up its back; before it the smelting hearth carved from one block (an arched fire-mouth,
    # runic vents, a crucible in its top), a stone spout running molten metal into an ingot mould,
    # the quench trough, the bellows at its flank; charcoal grit and slag round its base
    F = L["forge"]
    fy = G.y(F["x"], F["z"] + F["d"] / 2 + 0.3)
    fx0, fx1 = F["x"] - F["w"] / 2, F["x"] + F["w"] / 2
    cols = []
    for k in range(14):
        side = -1 if k % 2 == 0 else 1
        j = k // 2
        row = j % 2
        cx_ = (fx0 - 0.15 - 0.36 * j) if side < 0 else (fx1 + 0.15 + 0.36 * j)
        cz_ = -half + 0.5 + 0.42 * row + 0.12 * rng.random()
        ht = max(0.5, F["h"] + 1.9 - 0.62 * j + 1.1 * rng.random() - 0.5 * row)
        cols.append((cx_, cz_, 0.3 + 0.07 * rng.random(), ht))
    for k, (cx_, cz_, r_, ht) in enumerate(cols):
        prism_col(rock, (cx_, fy - 0.3, cz_), r_, ht, "basaltDeep" if k % 3 else "basalt")
    # the combustion chamber: a tall U of basalt slabs, its inner back glowing from the embers up
    chx0, chx1 = F["x"] - 0.72, F["x"] + 0.72
    chz = -half - 0.15
    top_ = fy + F["h"] + 0.6
    for x0_, x1_ in ((chx0 - 0.3, chx0), (chx1, chx1 + 0.3)):
        box(rock, x0_, x1_, fy - 0.2, top_, chz - 0.3, F["z"] - 0.35, "basaltDeep", top="basalt")
    box(rock, chx0 - 0.3, chx1 + 0.3, top_ - 0.25, top_ + 0.2, chz - 0.3, F["z"] - 0.45, "basalt")
    # the smelting chamber's arch: voussoirs of dressed basalt over its mouth, springing from the
    # chamber's jambs, the keystone lit from below
    az0, az1 = F["z"] - 0.62, F["z"] - 0.32
    spring = fy + 1.25
    Ri, Ro = (chx1 - chx0) / 2 + 0.02, (chx1 - chx0) / 2 + 0.34
    nseg = 9
    for k in range(nseg):
        a0, a1 = math.pi * k / nseg, math.pi * (k + 1) / nseg
        pts = []
        for a in (a0, a1):
            for rr in (Ri, Ro):
                for zz in (az0, az1):
                    pts.append((F["x"] + rr * math.cos(a), spring + rr * math.sin(a), zz))
        colr = "basaltLight" if k == nseg // 2 else ("basalt" if k % 2 else "basaltDeep")
        v = [rock.v(*q) for q in pts]
        # (the eight corners: [a][r][z]; the six faces of the voussoir)
        for quad in ((0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5), (0, 2, 3, 1), (4, 5, 7, 6)):
            f = rock.face([v[i] for i in quad], colr)
            f.normal_update()
            c_ = f.calc_center_median()
            mid = Vector(W(F["x"] + (Ri + Ro) / 2 * math.cos((a0 + a1) / 2), spring + (Ri + Ro) / 2 * math.sin((a0 + a1) / 2), (az0 + az1) / 2))
            if f.normal.dot(c_ - mid) < 0:
                f.normal_flip()
    # the jambs the arch springs from
    for jx in (chx0 - 0.34, chx1 + 0.02):
        box(rock, jx, jx + 0.32, fy - 0.1, spring, az0, az1, "basaltDeep", top="basalt")
    # the runic exhaust vents: slits glowing up the jambs' faces
    for jx in (chx0 - 0.18, chx1 + 0.18):
        for k in range(3):
            y0_ = fy + 0.35 + 0.3 * k
            q = [glow.v(jx - 0.025, y0_, az1 + 0.012), glow.v(jx + 0.025, y0_, az1 + 0.012), glow.v(jx + 0.025, y0_ + 0.18, az1 + 0.012), glow.v(jx - 0.025, y0_ + 0.18, az1 + 0.012)]
            f = glow.face(q, "runeFire" if k != 1 else "ember")
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
    rings = []
    for yy, colr in ((fy + 0.2, "forgeCore"), (fy + 0.9, "magmaHot"), (fy + 1.8, "ember"), (fy + 2.8, "emberDeep"), (top_ - 0.3, "basaltDeep")):
        a_ = glow.v(chx0 + 0.02, yy, chz + 0.02)
        b_ = glow.v(chx1 - 0.02, yy, chz + 0.02)
        glow.setv(a_, colr)
        glow.setv(b_, colr)
        rings.append((a_, b_))
    for (a0, b0), (a1, b1) in zip(rings, rings[1:]):
        f = glow.face((a0, b0, b1, a1), "ember")
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    for k in range(9):
        blob(glow, F["x"] + (rng.random() - 0.5) * 1.1, fy + 0.12 + 0.06 * rng.random(), chz + 0.25 + 0.4 * rng.random(), 0.09, 0.05, 0.08, "magmaHot" if k % 2 else "forgeCore", cuts=0)
    # the hearth: one carved block, bevelled, before the chamber
    hx0, hx1 = F["x"] - 0.62, F["x"] + 0.62
    hz0, hz1 = F["z"] - 0.35, F["z"] + 0.55
    hy = fy + 0.85
    box(rock, hx0 - 0.07, hx1 + 0.07, fy - 0.1, fy + 0.14, hz0 - 0.05, hz1 + 0.07, "basalt", top="basaltLight")
    box(rock, hx0, hx1, fy + 0.14, hy - 0.08, hz0, hz1, "stoneDark", top="basaltLight")
    for qx in (hx0 - 0.015, hx1 - 0.105):
        for k in range(3):
            box(rock, qx, qx + 0.12, fy + 0.16 + 0.22 * k, fy + 0.34 + 0.22 * k, hz1 - 0.12, hz1 + 0.015, "basaltLight" if k % 2 else "basalt")
    box(rock, hx0 - 0.05, hx1 + 0.05, hy - 0.08, hy, hz0 - 0.03, hz1 + 0.05, "basaltLight")
    # its fire-mouth: an arch of embers in the front face, a dark lintel over it
    mz = hz1 + 0.012
    arch = [(F["x"] - 0.26, fy + 0.08), (F["x"] - 0.26, fy + 0.34)] + [(F["x"] - 0.26 * math.cos(math.pi * k / 6), fy + 0.34 + 0.2 * math.sin(math.pi * k / 6)) for k in range(1, 6)] + [(F["x"] + 0.26, fy + 0.34), (F["x"] + 0.26, fy + 0.08)]
    mid = glow.v(F["x"], fy + 0.22, mz)
    glow.setv(mid, "forgeCore")
    av = []
    for ax_, ay_ in arch:
        v = glow.v(ax_, ay_, mz)
        glow.setv(v, "ember")
        av.append(v)
    for a0, a1 in zip(av, av[1:]):
        f = glow.face((mid, a0, a1), "ember")
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    box(rock, F["x"] - 0.34, F["x"] + 0.34, fy + 0.56, fy + 0.64, hz1, hz1 + 0.05, "basaltDeep")
    # the runic vents either side of the mouth: slits glowing in rune shapes
    for sx in (-1, 1):
        for k, ((ax_, ay_), (bx_, by_)) in enumerate((((0.0, 0.0), (0.0, 0.3)), ((-0.06, 0.2), (0.06, 0.1)), ((-0.05, 0.06), (0.05, 0.12)))):
            cx_ = F["x"] + sx * 0.46
            base_y = fy + 0.2
            dx, dy = bx_ - ax_, by_ - ay_
            ln = math.hypot(dx, dy) or 1
            ox, oy = -dy / ln * 0.014, dx / ln * 0.014
            q = [glow.v(cx_ + ax_ + ox, base_y + ay_ + oy, mz), glow.v(cx_ + ax_ - ox, base_y + ay_ - oy, mz), glow.v(cx_ + bx_ - ox, base_y + by_ - oy, mz), glow.v(cx_ + bx_ + ox, base_y + by_ + oy, mz)]
            f = glow.face(q, "runeFire")
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
    # the crucible sunk in its top, molten metal in it
    lathe(rock, F["x"], F["z"] + 0.1, [(0, 0), (0.3, 0.0), (0.34, 0.1), (0.27, 0.12), (0, 0.02)], "stoneDark", segs=10, y0=hy - 0.02)
    lathe(glow, F["x"], F["z"] + 0.1, [(0, 0), (0.24, 0.0), (0.24, 0.01), (0, 0.015)], "magmaHot", segs=10, y0=hy + 0.07)
    # the runoff spout: a stone channel out of the hearth's left flank, a thread of molten metal
    # running down it into the ingot mould
    sx0 = hx0
    cyl(rock, (sx0 + 0.05, hy - 0.2, F["z"] + 0.25), (sx0 - 0.42, hy - 0.42, F["z"] + 0.3), 0.07, "stoneDark", sides=6)
    cyl(glow, (sx0 + 0.02, hy - 0.16, F["z"] + 0.25), (sx0 - 0.4, hy - 0.37, F["z"] + 0.3), 0.022, "magmaHot", sides=5)
    cyl(glow, (sx0 - 0.42, hy - 0.38, F["z"] + 0.3), (sx0 - 0.46, fy + 0.33, F["z"] + 0.3), 0.014, "magma", sides=4)
    mx0 = sx0 - 0.72
    box(rock, mx0, mx0 + 0.52, fy - 0.05, fy + 0.3, F["z"] + 0.08, F["z"] + 0.52, "basalt", top="stoneDark")
    box(glow, mx0 + 0.1, mx0 + 0.42, fy + 0.3, fy + 0.32, F["z"] + 0.2, F["z"] + 0.4, "magma", bottom=False)
    # the quench trough carved in a basalt block, dark water in it, tongs across it
    tx0, tx1 = hx1 + 0.12, hx1 + 0.78
    tz0, tz1 = F["z"] + 0.02, F["z"] + 0.58
    box(rock, tx0, tx1, fy - 0.05, fy + 0.42, tz0, tz1, "basalt", top="basaltLight")
    box(rock, tx0 + 0.06, tx1 - 0.06, fy + 0.3, fy + 0.425, tz0 + 0.06, tz1 - 0.06, "tunnel", bottom=False)
    q = [water.v(tx0 + 0.07, fy + 0.36, tz0 + 0.07), water.v(tx0 + 0.07, fy + 0.36, tz1 - 0.07), water.v(tx1 - 0.07, fy + 0.36, tz1 - 0.07), water.v(tx1 - 0.07, fy + 0.36, tz0 + 0.07)]
    for v in q:
        water.setv(v, "waterDark")
    f = water.face(q, "waterDark")
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    cyl(rock, (tx0 + 0.05, fy + 0.46, tz0 + 0.2), (tx1 - 0.05, fy + 0.46, tz0 + 0.3), 0.012, "iron", sides=4)
    cyl(rock, (tx0 + 0.05, fy + 0.46, tz0 + 0.28), (tx1 - 0.05, fy + 0.46, tz0 + 0.38), 0.012, "iron", sides=4)
    # the bellows at the hearth's right flank, their nozzle into it
    bx0 = hx1 + 0.12
    bz0 = F["z"] - 0.62
    box(rock, bx0, bx0 + 0.62, fy + 0.3, fy + 0.4, bz0, bz0 + 0.5, "timber")
    box(rock, bx0 + 0.03, bx0 + 0.59, fy + 0.4, fy + 0.58, bz0 + 0.03, bz0 + 0.47, "leather")
    box(rock, bx0, bx0 + 0.62, fy + 0.58, fy + 0.68, bz0, bz0 + 0.5, "timber")
    cyl(rock, (bx0 + 0.02, fy + 0.48, bz0 + 0.25), (hx1 - 0.02, fy + 0.4, bz0 + 0.3), 0.035, "iron", sides=6)
    for k in range(2):
        cyl(rock, (bx0 + 0.15 + 0.3 * k, fy - 0.05, bz0 + 0.1), (bx0 + 0.15 + 0.3 * k, fy + 0.3, bz0 + 0.1), 0.04, "timberDark", sides=5)
    # charcoal grit and slag flakes strewn round its foot
    for k in range(34):
        a = rng.random() * math.pi
        rr = 0.75 + 0.9 * rng.random()
        x = F["x"] + math.cos(a) * rr * 1.2
        z = F["z"] + 0.45 + math.sin(a) * rr * 0.55
        slag = k % 3 == 0
        angular(rock, x, G.y(x, z), z, 0.035 + 0.05 * rng.random(), 0.03, rng, "slagViolet" if slag and k % 2 else ("slag" if slag else "charcoal"), "charcoal", sink=0.01, npts=6)
    # the meteorite anvil: a pitted slab of dark iron-nickel on a rugged limestone pedestal, chisels
    # and a mallet laid by, split geodes glittering at its foot
    An = L["anvil"]
    ay = G.y(An["x"], An["z"])
    oc = An["outcrop"]
    angular(rock, An["x"], ay, An["z"], 0.5, oc + 0.1, rng, "limeCool", "limestoneDark", sink=0.1, npts=16)
    angular(rock, An["x"] + 0.32, ay, An["z"] - 0.22, 0.26, oc * 0.55, rng, "limestone", "limestoneDark", sink=0.1, npts=10)
    for f in chunk(rock, 0.36, 0.2, rng, sink=0.0, squash=0.72, at=(An["x"], ay + oc - 0.05, An["z"]), npts=14):
        f.normal_update()
        rock.setf(f, "steel" if f.normal.z > 0.8 else "meteorite")
    for k in range(6):
        a = rng.random() * 6.28
        blob(glow, An["x"] + math.cos(a) * 0.24, ay + oc + 0.02 + 0.08 * rng.random(), An["z"] + math.sin(a) * 0.18, 0.018, 0.012, 0.018, "violetSoft", cuts=0)
    for k, (dx, dz, ang) in enumerate(((-0.2, 0.08, 0.3), (0.05, 0.14, -0.4), (0.18, -0.1, 1.1))):
        x, z = An["x"] + dx, An["z"] + dz
        cyl(rock, (x - math.cos(ang) * 0.14, ay + oc + 0.17, z - math.sin(ang) * 0.14), (x + math.cos(ang) * 0.14, ay + oc + 0.17, z + math.sin(ang) * 0.14), 0.014, "steel" if k % 2 else "iron", sides=5)
    cyl(rock, (An["x"] - 0.45, ay + 0.02, An["z"] + 0.35), (An["x"] - 0.2, ay + 0.3, An["z"] + 0.42), 0.022, "timber", sides=5)
    box(rock, An["x"] - 0.28, An["x"] - 0.12, ay + 0.26, ay + 0.36, An["z"] + 0.36, An["z"] + 0.48, "iron")
    for k in range(2):
        gx, gz = An["x"] + 0.42 - 0.2 * k, An["z"] + 0.32 + 0.12 * k
        gy = G.y(gx, gz)
        lathe(rock, gx, gz, [(0, 0), (0.1, 0.0), (0.12, 0.06), (0.1, 0.1), (0, 0.1)], "limestoneDark", segs=8, y0=gy - 0.02)
        blob(glow, gx, gy + 0.08, gz, 0.07, 0.03, 0.07, "violet" if k else "cyan", cuts=1)
    # the workshop's floor: flagstones laid from the anvil to the forge's hearth, one masonry
    # workstation (level with the floor: walked on, never tripped over)
    frng = random.Random(77)
    fx0_, fx1_ = An["x"] - 1.0, F["x"] + 1.9
    fz0_, fz1_ = F["z"] + 0.35, An["z"] + 1.0
    zz = fz0_
    row = 0
    while zz < fz1_:
        dz_ = 0.42 + 0.18 * frng.random()
        xx = fx0_ + (0.2 if row % 2 else 0.0)
        while xx < fx1_:
            dx_ = 0.45 + 0.3 * frng.random()
            g_ = 0.035
            corners = [(xx + g_, zz + g_), (xx + dx_ - g_, zz + g_ + 0.02 * frng.random()), (xx + dx_ - g_, zz + dz_ - g_), (xx + g_ + 0.02 * frng.random(), zz + dz_ - g_)]
            # (never under the adit's rails, never on the slope)
            if all(G.walk(cx, cz) for cx, cz in corners) and xx > 1.6:
                q = [rock.v(cx, G.y(cx, cz) + 0.018, cz) for cx, cz in corners]
                f = rock.face(q, "flagstone" if frng.random() < 0.6 else "flagstoneDark")
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
            xx += dx_
        zz += dz_
        row += 1
    rx_, rz_ = An["x"] - 0.85, An["z"] - 0.95
    ry_ = G.y(rx_, rz_)
    for sx in (-0.3, 0.3):
        cyl(rock, (rx_ + sx, ry_ - 0.05, rz_), (rx_ + sx, ry_ + 0.95, rz_), 0.03, "timberDark", sides=5)
    cyl(rock, (rx_ - 0.36, ry_ + 0.88, rz_), (rx_ + 0.36, ry_ + 0.88, rz_), 0.025, "timber", sides=5)
    for k in range(5):
        x = rx_ - 0.24 + k * 0.12
        cyl(rock, (x, ry_ + 0.86, rz_ + 0.02), (x, ry_ + 0.5 + 0.08 * (k % 2), rz_ + 0.04), 0.012, "steel" if k % 2 else "iron", sides=4)
    Cr = L["crate"]
    cy_ = G.y(Cr["x"], Cr["z"])
    box(rock, Cr["x"] - Cr["w"] / 2, Cr["x"] + Cr["w"] / 2, cy_ - 0.05, cy_ + Cr["h"], Cr["z"] - Cr["d"] / 2, Cr["z"] + Cr["d"] / 2, "timber", top="timberDark")
    for sx in (-0.3, 0.3):
        box(rock, Cr["x"] + sx - 0.03, Cr["x"] + sx + 0.03, cy_ - 0.05, cy_ + Cr["h"] + 0.005, Cr["z"] - Cr["d"] / 2 - 0.005, Cr["z"] + Cr["d"] / 2 + 0.005, "iron")
    for k in range(4):
        cyl(rock, (Cr["x"] - 0.25 + k * 0.14, cy_ + Cr["h"] - 0.1, Cr["z"] - 0.05), (Cr["x"] - 0.2 + k * 0.14, cy_ + Cr["h"] + 0.22, Cr["z"] - 0.1 + 0.05 * k), 0.022, "steel" if k % 2 else "timberDark", sides=5)


def build_basecamp_gear(G, L, rock, glow, rng):
    for x, z, kind, yaw in L["campProps"]:
        y = G.y(x, z)
        c, s = math.cos(yaw), math.sin(yaw)
        if kind == "barrels":
            for dx, dz, h in ((-0.3, 0.0, 0.75), (0.32, 0.1, 0.7), (0.0, -0.35, 0.8)):
                bx, bz = x + dx * c - dz * s, z + dx * s + dz * c
                lathe(rock, bx, bz, [(0, 0), (0.24, 0.0), (0.28, h * 0.5), (0.24, h), (0, h)], "barrel", segs=9, y0=y - 0.02)
                for hy in (0.15, h - 0.15):
                    cyl(rock, (bx, y + hy - 0.02, bz), (bx, y + hy + 0.02, bz), 0.27, "iron", sides=9)
        elif kind == "crates":
            for dx, dz, dy, w in ((-0.3, 0.0, 0.0, 0.55), (0.32, 0.05, 0.0, 0.5), (0.0, 0.0, 0.5, 0.48)):
                bx, bz = x + dx, z + dz
                box(rock, bx - w / 2, bx + w / 2, y + dy - 0.02, y + dy + w * 0.9, bz - w / 2, bz + w / 2, "timber", top="plank")
            # (a pickaxe and a shovel leaning on them)
            cyl(rock, (x + 0.7, y, z + 0.3), (x + 0.45, y + 1.0, z + 0.1), 0.025, "timber", sides=4)
            box(rock, x + 0.3, x + 0.62, y + 0.95, y + 1.02, z + 0.06, z + 0.14, "steel")
            cyl(rock, (x - 0.75, y, z + 0.3), (x - 0.5, y + 1.05, z + 0.1), 0.022, "timberDark", sides=4)
        elif kind == "bedroll":
            cyl(rock, (x - 0.8 * c, y + 0.1, z - 0.8 * s), (x + 0.8 * c, y + 0.1, z + 0.8 * s), 0.13, "bedroll", sides=7)
            blob(rock, x + 0.95 * c, y + 0.1, z + 0.95 * s, 0.22, 0.09, 0.16, "canvas", cuts=1)
        elif kind == "board":
            # the survey board: the expedition's map of the caverns on an easel
            for dx in (-0.4, 0.4):
                cyl(rock, (x + dx * c, y - 0.05, z + dx * s), (x + dx * c * 0.8, y + 1.5, z + dx * s * 0.8), 0.03, "timberDark", sides=4)
            cyl(rock, (x, y - 0.05, z - 0.4), (x, y + 1.3, z), 0.025, "timber", sides=4)
            q = [rock.v(x - 0.45 * c, y + 0.75, z - 0.45 * s), rock.v(x + 0.45 * c, y + 0.75, z + 0.45 * s), rock.v(x + 0.42 * c, y + 1.45, z + 0.42 * s), rock.v(x - 0.42 * c, y + 1.45, z - 0.42 * s)]
            rock.facing(q, "mapPaper", (-s, 0.2, c))
            rock.facing([rock.v(*game_point(p.co)) for p in reversed(q)], "timber", (s, -0.2, -c))
        elif kind == "post":
            cyl(rock, (x, y - 0.1, z), (x, y + 2.1, z), 0.07, "timberDark", sides=6)
            cyl(rock, (x, y + 2.0, z), (x + 0.45, y + 2.0, z), 0.04, "timber", sides=4)
            lantern(rock, glow, x + 0.42, y + 1.98, z, hang=0.2)


def build_winch(G, L, rock, glow, coll):
    """Gus's winch lift: a timber gantry at the coal breakdown's edge, its boom out over the cliff, the
    rope down to a plank cage on the glimmer rift's floor. The parts that move are objects of their own,
    each with its origin where it moves from (the game lifts the cage, pays out the rope and turns the
    drum as someone rides up: CavernsWorld's WinchRig): `Prop_WinchCage` (at the cage's floor),
    `Prop_WinchRope` (at the boom's end, hanging down to the cage's top), `Prop_WinchDrum` (on its
    axle)."""
    Wn = L["winch"]
    x, zt, zb = Wn["x"], Wn["top"], Wn["bottom"]
    yt, yb = G.y(x, zt), G.y(x, zb)
    for sx in (-0.7, 0.7):
        cyl(rock, (x + sx, yt - 0.1, zt), (x + sx, yt + 2.6, zt), 0.09, "timberDark", sides=6)
        cyl(rock, (x + sx, yt - 0.1, zt - 0.8), (x + sx, yt + 2.2, zt), 0.06, "timber", sides=5)
    cyl(rock, (x - 0.85, yt + 2.5, zt), (x + 0.85, yt + 2.5, zt), 0.08, "timber", sides=6)
    cyl(rock, (x, yt + 2.5, zt - 0.4), (x, yt + 2.55, zb), 0.07, "timber", sides=6)
    cyl(rock, (x, yt + 1.2, zt), (x, yt + 2.45, zt + (zb - zt) * 0.55), 0.05, "timberDark", sides=5)
    # (the drum's two bearings on the gantry's back legs)
    for sx in (-0.62, 0.62):
        box(rock, x + sx - 0.06, x + sx + 0.06, yt - 0.1, yt + 0.95, zt - 0.51, zt - 0.39, "timberDark")
    lantern(rock, glow, x + 0.7, yt + 2.45, zt, hang=0.3)
    # the drum and its crank, turning on their axle
    drum = Mesh("CV_Clay")
    axle = (x, yt + 0.85, zt - 0.45)
    cyl(drum, (x - 0.55, axle[1], axle[2]), (x + 0.55, axle[1], axle[2]), 0.2, "timberDark", sides=8)
    for sx in (-0.5, -0.2, 0.1, 0.4):
        cyl(drum, (x + sx, axle[1], axle[2]), (x + sx + 0.1, axle[1], axle[2]), 0.215, "canvasShade", sides=8)
    cyl(drum, (x + 0.55, axle[1], axle[2]), (x + 0.75, axle[1] + 0.25, axle[2]), 0.03, "iron", sides=4)
    cyl(drum, (x + 0.75, axle[1] + 0.25, axle[2]), (x + 0.9, axle[1] + 0.25, axle[2]), 0.035, "timber", sides=5)
    pivot_object(finish_object("Prop_WinchDrum", drum, coll), axle)
    # the rope, from the boom's end down to the cage's top
    rope = Mesh("CV_Clay")
    top = (x, yt + 2.5, zb)
    cyl(rope, top, (x, yb + 2.35, zb), 0.025, "canvasShade", sides=5)
    pivot_object(finish_object("Prop_WinchRope", rope, coll), top)
    # the cage, waiting on the rift's floor
    cage = Mesh("CV_Clay")
    box(cage, x - 0.6, x + 0.6, yb - 0.05, yb + 0.08, zb - 0.6, zb + 0.6, "plank")
    for dx, dz in ((-0.55, -0.55), (0.55, -0.55), (0.55, 0.55), (-0.55, 0.55)):
        cyl(cage, (x + dx, yb, zb + dz), (x + dx, yb + 2.0, zb + dz), 0.04, "timber", sides=5)
    for (ax, az), (bx, bz) in (((-0.55, -0.55), (0.55, -0.55)), ((0.55, -0.55), (0.55, 0.55)), ((0.55, 0.55), (-0.55, 0.55)), ((-0.55, 0.55), (-0.55, -0.55))):
        cyl(cage, (x + ax, yb + 2.0, zb + az), (x + bx, yb + 2.0, zb + bz), 0.035, "timberDark", sides=4)
        cyl(cage, (x + ax, yb + 1.0, zb + az), (x + bx, yb + 1.0, zb + bz), 0.025, "timber", sides=4)
    # (the bridle from its four corners up to the ring the rope ties to, and the cage's lamp, lit)
    for dx, dz in ((-0.55, -0.55), (0.55, -0.55), (0.55, 0.55), (-0.55, 0.55)):
        cyl(cage, (x + dx, yb + 2.0, zb + dz), (x, yb + 2.35, zb), 0.012, "iron", sides=4)
    lathe(cage, x, zb, [(0, 0), (0.05, 0.0), (0.05, 0.03), (0, 0.03)], "iron", segs=6, y0=yb + 2.33)
    lantern(cage, cage, x + 0.55, yb + 2.0, zb + 0.55, hang=0.25)
    pivot_object(finish_object("Prop_WinchCage", cage, coll), (x, yb, zb))


def pivot_object(ob, pivot):
    """An object whose origin is `pivot` (a game point), its mesh unmoved in the world: where the game
    moves or turns it from."""
    from mathutils import Matrix
    p = W(*pivot)
    ob.data.transform(Matrix.Translation(-p))
    ob.location = p
    return ob
