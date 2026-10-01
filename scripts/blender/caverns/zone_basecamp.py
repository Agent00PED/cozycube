"""The Expedition Basecamp: Gus's trading post against the north wall (`build_camp`), the Basalt Crucible Forge and its
workshop carried over exactly as they were built (`build_forge_alcove`), the camp's gear
(`build_basecamp_gear`) and Gus's winch at the breakdown's edge with its moving cage, rope and drum
(`build_winch`, `pivot_object`)."""

import math
import random

from mathutils import Vector
from .kit import (
    angular, blob, box, chunk, cyl, game_point, hullbox, lantern, lathe, Mesh, prism, prism_col, tarp, turned, W,
)
from .scene import finish_object


# ---------------------------------------------------------------------------------------------
# the Expedition Basecamp


def build_camp(G, L, rock, glow):
    """Gus's trading post (docs/caverns-roadmap.md R3.2): a timber lean-to against the north wall west
    of the adit, out of the shelf's way. Its ledger beam pinned to the rock with iron dogs, rafters down
    to two front posts on stone footings with knee braces, a roof of overlapping shingles with a little
    sag; under it a plank counter with Gus behind it (brass ore scales, his ledger, samples), bins of
    each ore, a rack of the pickaxes he sells, the specimen crates with their glowing jars, a satchel
    hung up, two lanterns off the front beam and a painted sign (a pick over a gem) standing up on its front beam.
    The survey transit stands at the post's west end, sighting down the doline."""
    Wk, Cp = L["workstation"], L["camp"]
    wy = G.y(Wk["x"], Wk["z"])
    (fx0, fz), (fx1, _) = Cp["posts"]
    bz = Cp["wall"]
    ry, ey = wy + Cp["ridge"], wy + Cp["eave"]
    # the ledger beam on the rock, pinned by iron dogs
    cyl(rock, (fx0 - 0.35, ry, bz), (fx1 + 0.35, ry, bz), 0.09, "timberDark", sides=6)
    for x in (fx0, (fx0 + fx1) / 2, fx1):
        box(rock, x - 0.03, x + 0.03, ry - 0.2, ry + 0.12, bz - 0.25, bz + 0.1, "iron")
    # the front posts on stone footings, the front beam, knee braces
    for x in (fx0, fx1):
        py = G.y(x, fz)
        angular(rock, x, py, fz, 0.2, 0.14, random.Random(int(x * 10)), "limestoneLight", "limestone", sink=0.04, npts=8)
        cyl(rock, (x, py + 0.05, fz), (x, ey, fz), 0.09, "timber", sides=7)
        for sx in (-1, 1):
            if (x == fx0 and sx < 0) or (x == fx1 and sx > 0):
                continue
            cyl(rock, (x, ey - 0.55, fz), (x + sx * 0.5, ey - 0.02, fz), 0.035, "timberDark", sides=5)
        cyl(rock, (x, ey - 0.5, fz), (x, ry - 0.3, bz + 0.15), 0.04, "timberDark", sides=5)
    cyl(rock, (fx0 - 0.4, ey, fz), (fx1 + 0.4, ey, fz), 0.08, "timberDark", sides=6)
    # the slope from the ledger to the front beam, carried on past it for the eaves
    dz_, dy_ = fz - bz, ey - ry
    ln = math.hypot(dz_, dy_)
    uz, uy = dz_ / ln, dy_ / ln
    nz, ny = -uy, uz
    over = 0.3
    Ls = ln + over
    for k in range(6):
        x = fx0 - 0.2 + (fx1 - fx0 + 0.4) * k / 5
        cyl(rock, (x, ry + 0.08, bz), (x, ry + 0.08 + uy * Ls, bz + uz * Ls), 0.045, "timber", sides=5)
    # the shingles: rows from the eaves up, each row lapping over the one below, each shingle its own
    # length, tone and tilt, the whole roof sagging a little between its posts
    rng = random.Random(97)
    width = fx1 - fx0 + 1.1
    rows = 8
    step = Ls / rows
    for r in range(rows):
        s0 = Ls - (r + 1) * step
        u = fx0 - 0.55
        while u < fx0 - 0.55 + width - 0.05:
            w = min(0.26 + 0.12 * rng.random(), fx0 - 0.55 + width - u)
            su = (u + w / 2 - (fx0 - 0.55)) / width
            sv = (s0 + step / 2) / Ls
            sag = 0.07 * math.sin(math.pi * su) * math.sin(math.pi * min(1.0, sv * 1.1))
            lift = 0.14 + 0.012 * r
            cs = s0 + step * 0.52
            hs = step * 1.32
            cx = u + w / 2
            cy = ry + uy * cs + ny * lift - sag
            cz = bz + uz * cs + nz * lift
            tilt = 0.06 + 0.03 * rng.random()

            def rot(lx, ly, lz, tilt=tilt):
                # (lx across, ly out of the roof, lz down the slope; each shingle's lower edge lifted)
                ly2 = ly + lz * tilt
                return lx, ly2 * ny + lz * uy, ly2 * nz + lz * uz

            col = rng.choice(("shingle", "shingle", "shingleDark", "shingleLight"))
            hullbox(rock, (cx, cy, cz), rot, w / 2 - 0.012, 0.022, hs / 2, col, "shingleDark")
            u += w
    # the ridge's flashing where the roof meets the rock
    cyl(rock, (fx0 - 0.55, ry + 0.2, bz + 0.05), (fx0 - 0.55 + width, ry + 0.2, bz + 0.05), 0.06, "iron", sides=5)
    # the counter: a plank top on a boarded front, battens down it, open behind for Gus
    x0, x1 = Wk["x"] - Wk["len"] / 2, Wk["x"] + Wk["len"] / 2
    zf, zb = Wk["z"] + Wk["w"] / 2, Wk["z"] - Wk["w"] / 2
    top = wy + Wk["top"]
    box(rock, x0 - 0.06, x1 + 0.06, top - 0.06, top, zb - 0.04, zf + 0.06, "plank")
    box(rock, x0, x1, wy - 0.03, top - 0.06, zf - 0.07, zf, "timber")
    for k in range(7):
        bx = x0 + 0.1 + (x1 - x0 - 0.2) * k / 6
        box(rock, bx - 0.035, bx + 0.035, wy - 0.02, top - 0.07, zf - 0.005, zf + 0.025, "timberDark")
    for x in (x0, x1 - 0.07):
        box(rock, x, x + 0.07, wy - 0.03, top - 0.06, zb, zf, "timberDark")
    box(rock, x0 + 0.07, x1 - 0.07, wy + 0.3, wy + 0.34, zb + 0.05, zf - 0.08, "plank")
    # on it: the brass ore scales, his ledger open, a few samples, a lamp's worth of glints
    sx, sz = Wk["x"] + 0.55, Wk["z"] - 0.02
    box(rock, sx - 0.14, sx + 0.14, top, top + 0.04, sz - 0.08, sz + 0.08, "brassDark")
    cyl(rock, (sx, top + 0.04, sz), (sx, top + 0.36, sz), 0.018, "brass", sides=6)
    cyl(rock, (sx - 0.22, top + 0.34, sz), (sx + 0.22, top + 0.36, sz), 0.012, "brass", sides=5)
    for px, dy in ((-0.22, 0.0), (0.22, 0.03)):
        for q in range(3):
            a = 2 * math.pi * q / 3
            cyl(rock, (sx + px, top + 0.34 + dy, sz), (sx + px + 0.06 * math.cos(a), top + 0.16 + dy, sz + 0.06 * math.sin(a)), 0.004, "brassDark", sides=3, cap=False)
        lathe(rock, sx + px, sz, [(0, 0), (0.08, 0.01), (0.09, 0.03), (0, 0.02)], "brass", segs=9, y0=top + 0.13 + dy)
    blob(rock, sx - 0.22, top + 0.19, sz, 0.035, 0.03, 0.035, "copperNug", cuts=0)
    lx, lz = Wk["x"] - 0.45, Wk["z"] + 0.02
    box(rock, lx - 0.2, lx + 0.2, top, top + 0.025, lz - 0.14, lz + 0.14, "leather")
    for sx2 in (-1, 1):
        box(rock, lx + sx2 * 0.1 - 0.09, lx + sx2 * 0.1 + 0.09, top + 0.025, top + 0.035 + 0.01 * (sx2 > 0), lz - 0.12, lz + 0.12, "mapPaper")
    for k, colr in enumerate(("coalChunk", "silverVein", "copperNug")):
        blob(rock, Wk["x"] - 0.95 + k * 0.1, top + 0.03, Wk["z"] + 0.05 * (k % 2), 0.04, 0.03, 0.04, colr, cuts=0)
    # the ore bins against the rock: three open boxes heaped with coal, copper and iron
    bx0, bz0 = Cp["bins"]
    by = G.y(bx0, bz0)
    for k, (colr, colr2) in enumerate((("coalChunk", "coalFacet"), ("copperNug", "copperDark"), ("ironMetal", "ironDark"))):
        cx = bx0 - 0.5 + 0.5 * k
        for ax0, ax1, az0, az1 in ((cx - 0.23, cx + 0.23, bz0 + 0.18, bz0 + 0.22), (cx - 0.23, cx + 0.23, bz0 - 0.22, bz0 - 0.18), (cx - 0.23, cx - 0.19, bz0 - 0.22, bz0 + 0.22), (cx + 0.19, cx + 0.23, bz0 - 0.22, bz0 + 0.22)):
            box(rock, ax0, ax1, by - 0.02, by + 0.42, az0, az1, "timber", top="plank")
        blob(rock, cx, by + 0.36, bz0, 0.18, 0.1, 0.17, colr2, cuts=1)
        for q in range(4):
            blob(rock, cx - 0.1 + 0.07 * q, by + 0.44 + 0.02 * (q % 2), bz0 - 0.05 + 0.04 * (q % 3), 0.05, 0.04, 0.05, colr, cuts=0)
    # the pickaxe rack on the rock behind Gus: two uprights, two bars, the four he sells hanging
    rx, rz = Cp["rack"]
    rdy = G.y(rx, rz + 0.3)
    for dx in (-0.75, 0.75):
        box(rock, rx + dx - 0.04, rx + dx + 0.04, rdy - 0.05, rdy + 1.75, rz - 0.04, rz + 0.04, "timberDark")
    for hy in (0.55, 1.5):
        box(rock, rx - 0.82, rx + 0.82, rdy + hy - 0.03, rdy + hy + 0.03, rz + 0.03, rz + 0.09, "timber")
    heads = ("iron", "steel", "silverDark", "brass")
    for k in range(4):
        px = rx - 0.54 + 0.36 * k
        cyl(rock, (px, rdy + 0.6, rz + 0.12), (px + 0.04, rdy + 1.55, rz + 0.14), 0.022, "timber" if k % 2 else "timberDark", sides=5)
        box(rock, px - 0.2, px + 0.24, rdy + 1.5, rdy + 1.57, rz + 0.1, rz + 0.18, heads[k])
    # a satchel hung on the west post, a coil of rope on the east
    blob(rock, fx0 + 0.02, ey - 0.75, fz + 0.14, 0.14, 0.13, 0.07, "leather", cuts=2)
    cyl(rock, (fx0 - 0.1, ey - 0.62, fz + 0.12), (fx0 + 0.12, ey - 0.62, fz + 0.12), 0.012, "leather", sides=3)
    for q in range(3):
        cyl(rock, (fx1 + 0.08, ey - 0.8 - 0.04 * q, fz - 0.15), (fx1 + 0.08, ey - 0.8 - 0.04 * q, fz + 0.15), 0.1 - 0.012 * q, "canvasShade", sides=8)
    # the specimen crates, iron-strapped, their jars glowing with their finds
    cx, cz = Cp["crates"]
    cy = G.y(cx, cz)
    for dx, dz, w, d, h, y0 in ((-0.2, 0.0, 0.55, 0.5, 0.45, 0.0), (0.28, 0.02, 0.45, 0.45, 0.4, 0.0), (-0.12, 0.02, 0.5, 0.45, 0.38, 0.45)):
        x0_, z0_ = cx + dx - w / 2, cz + dz - d / 2
        box(rock, x0_, x0_ + w, cy + y0 - 0.02, cy + y0 + h, z0_, z0_ + d, "timber", top="plank")
        for sxx in (0.12, w - 0.12):
            box(rock, x0_ + sxx - 0.025, x0_ + sxx + 0.025, cy + y0 - 0.02, cy + y0 + h + 0.004, z0_ - 0.004, z0_ + d + 0.004, "iron")
    jy = cy + 0.83
    for k, g in enumerate(("cyan", "copperGlow", "violet")):
        jx = cx - 0.3 + k * 0.17
        lathe(rock, jx, cz + 0.08, [(0, 0), (0.05, 0.0), (0.055, 0.12), (0.035, 0.15), (0, 0.16)], "glass", segs=7, y0=jy)
        blob(glow, jx, jy + 0.06, cz + 0.08, 0.03, 0.04, 0.03, g, cuts=0)
    # two lanterns off the front beam, and the sign between them: a pick over a gem
    for x in (fx0 + 0.55, fx1 - 0.55):
        lantern(rock, glow, x, ey - 0.06, fz + 0.02, hang=0.24)
    # (the sign stands up on the front beam, over the eaves, where it is seen over the roof)
    gx, gy, gz = Wk["x"], ey + 0.5, fz + 0.12
    for dx in (-0.36, 0.36):
        box(rock, gx + dx - 0.03, gx + dx + 0.03, ey - 0.05, gy - 0.18, gz - 0.08, gz - 0.02, "timberDark")
    box(rock, gx - 0.46, gx + 0.46, gy - 0.2, gy + 0.2, gz - 0.035, gz + 0.02, "plank")
    box(rock, gx - 0.49, gx + 0.49, gy - 0.23, gy + 0.23, gz - 0.05, gz - 0.035, "timberDark")

    def glyph(pts, col):
        f = rock.face([rock.v(gx + u, gy + v, gz + 0.024) for u, v in pts], col)
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()

    glyph([(-0.02, -0.14), (0.02, -0.14), (0.02, 0.1), (-0.02, 0.1)], "timberDark")
    glyph([(-0.2, 0.06), (0.0, 0.14), (0.2, 0.06), (0.2, 0.1), (0.0, 0.18), (-0.2, 0.1)], "iron")
    glyph([(0.16, -0.06), (0.24, -0.12), (0.32, -0.06), (0.24, 0.02)], "cyanSoft")
    glyph([(-0.32, -0.06), (-0.24, -0.12), (-0.16, -0.06), (-0.24, 0.02)], "copperNug")
    # the brass survey transit on its tripod, sighting down the doline
    tx, tz = Cp["transit"]
    ty = G.y(tx, tz)
    head = (tx, ty + 1.15, tz)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        cyl(rock, (tx + math.cos(a) * 0.42, ty - 0.05, tz + math.sin(a) * 0.42), head, 0.02, "timber", sides=5)
    box(rock, tx - 0.07, tx + 0.07, ty + 1.12, ty + 1.2, tz - 0.07, tz + 0.07, "brassDark")
    cyl(rock, (tx, ty + 1.2, tz), (tx, ty + 1.3, tz), 0.035, "brass", sides=8)
    cyl(rock, (tx - 0.18, ty + 1.34, tz + 0.02), (tx + 0.2, ty + 1.36, tz - 0.02), 0.035, "brass", sides=8)


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
            # (a sleeping bag laid out along `yaw` (its foot toward (sin yaw, cos yaw), its head and a
            # rolled blanket for a pillow at the other end), quilted across, its top turned back: laid
            # inside a tent, its foot at the door; docs/caverns-roadmap.md R11.2)
            rot = turned(yaw)

            def at(u, h, v=0.0):
                ox, oy, oz = rot(u, h, v)
                return (x + ox, y + oy, z + oz)
            hullbox(rock, at(0.05, 0.045), rot, 0.7, 0.065, 0.3, "bedroll", "bedroll")
            hullbox(rock, at(-0.5, 0.065), rot, 0.14, 0.08, 0.31, "canvasShade", "canvasShade")
            for q in range(4):
                hullbox(rock, at(-0.15 + q * 0.26, 0.112), rot, 0.014, 0.006, 0.29, "canvasShade", "canvasShade")
            cyl(rock, at(-0.78, 0.1, -0.27), at(-0.78, 0.1, 0.27), 0.1, "canvas", sides=7)
        elif kind == "board":
            # the survey board: the expedition's map of the caverns on an easel
            for dx in (-0.4, 0.4):
                cyl(rock, (x + dx * c, y - 0.05, z + dx * s), (x + dx * c * 0.8, y + 1.5, z + dx * s * 0.8), 0.03, "timberDark", sides=4)
            cyl(rock, (x, y - 0.05, z - 0.4), (x, y + 1.3, z), 0.025, "timber", sides=4)
            q = [rock.v(x - 0.45 * c, y + 0.75, z - 0.45 * s), rock.v(x + 0.45 * c, y + 0.75, z + 0.45 * s), rock.v(x + 0.42 * c, y + 1.45, z + 0.42 * s), rock.v(x - 0.42 * c, y + 1.45, z - 0.42 * s)]
            rock.facing(q, "mapPaper", (-s, 0.2, c))
            rock.facing([rock.v(*game_point(p.co)) for p in reversed(q)], "timber", (s, -0.2, -c))
        elif kind == "tent":
            # an expedition's ridge tent: canvas over a ridge pole on two uprights, guy lines pegged
            # out, its door flap pinned back
            hl, hw_, hh = 1.0, 0.75, 1.15
            ex, ez = math.sin(yaw), math.cos(yaw)
            nx_, nz_ = math.cos(yaw), -math.sin(yaw)
            for e in (-1, 1):
                cyl(rock, (x + ex * hl * e, y - 0.05, z + ez * hl * e), (x + ex * hl * e, y + hh, z + ez * hl * e), 0.03, "timberDark", sides=5)
            cyl(rock, (x - ex * (hl + 0.1), y + hh, z - ez * (hl + 0.1)), (x + ex * (hl + 0.1), y + hh, z + ez * (hl + 0.1)), 0.03, "timber", sides=5)
            for sd in (-1, 1):
                tarp(rock, [(x - ex * hl + nx_ * sd * 0.02, y + hh, z - ez * hl + nz_ * sd * 0.02), (x + ex * hl + nx_ * sd * 0.02, y + hh, z + ez * hl + nz_ * sd * 0.02), (x + ex * hl + nx_ * sd * hw_, y + 0.02, z + ez * hl + nz_ * sd * hw_), (x - ex * hl + nx_ * sd * hw_, y + 0.02, z - ez * hl + nz_ * sd * hw_)], 0.05, "canvas", "canvasShade")
                for e in (-1, 1):
                    px_, pz_ = x + ex * (hl + 0.55) * e, z + ez * (hl + 0.55) * e
                    cyl(rock, (x + ex * hl * e, y + hh, z + ez * hl * e), (px_, G.y(px_, pz_) + 0.05, pz_), 0.006, "canvasShade", sides=3, cap=False)
            # (the back closed, the door end's flap pinned back)
            back = [rock.v(x - ex * hl + nx_ * hw_, y + 0.02, z - ez * hl + nz_ * hw_), rock.v(x - ex * hl - nx_ * hw_, y + 0.02, z - ez * hl - nz_ * hw_), rock.v(x - ex * hl, y + hh, z - ez * hl)]
            rock.facing(back, "canvasShade", (-ex, 0.0, -ez))
            flap = [rock.v(x + ex * hl, y + hh, z + ez * hl), rock.v(x + ex * hl + nx_ * hw_, y + 0.02, z + ez * hl + nz_ * hw_), rock.v(x + ex * (hl + 0.25) + nx_ * hw_ * 1.1, y + 0.05, z + ez * (hl + 0.25) + nz_ * hw_ * 1.1)]
            rock.facing(flap, "canvas", (ex, 0.2, ez))
            flap2 = [rock.v(*game_point(v.co)) for v in reversed(flap)]
            rock.facing(flap2, "canvasShade", (-ex, -0.2, -ez))
        elif kind == "sacks":
            for dx, dz, sh in ((-0.25, 0.0, 0.42), (0.22, 0.08, 0.38), (0.0, -0.3, 0.34)):
                blob(rock, x + dx, y + sh * 0.5, z + dz, 0.2, sh * 0.5, 0.18, "canvasShade", cuts=2, noise=0.08, seed=int(dx * 100))
                cyl(rock, (x + dx, y + sh - 0.02, z + dz), (x + dx, y + sh + 0.06, z + dz), 0.04, "canvas", sides=5)
        elif kind == "firewood":
            # (a woodpile for the hearth: split logs stacked three, two, one, a chopping stump beside
            # it with a hatchet bitten into its top: docs/caverns-roadmap.md R10.1)
            ux, uz = c, s
            vx, vz = -s, c
            for row, n in enumerate((3, 2, 1)):
                for q in range(n):
                    off = (q - (n - 1) / 2) * 0.2
                    cx_, cz_ = x + vx * off, z + vz * off
                    yy = y + 0.09 + row * 0.16
                    cyl(rock, (cx_ - ux * 0.42, yy, cz_ - uz * 0.42), (cx_ + ux * 0.42, yy, cz_ + uz * 0.42), 0.085, "timberDark" if (row + q) % 2 else "timber", sides=6)
            sx_, sz_ = x + vx * 0.7, z + vz * 0.7
            cyl(rock, (sx_, y - 0.05, sz_), (sx_, y + 0.32, sz_), 0.2, "timberDark", sides=8)
            cyl(rock, (sx_, y + 0.32, sz_), (sx_ + 0.01, y + 0.33, sz_), 0.19, "timber", sides=8)
            cyl(rock, (sx_ + 0.05, y + 0.36, sz_), (sx_ + 0.38, y + 0.55, sz_ + 0.12), 0.018, "timber", sides=4)
            box(rock, sx_ - 0.03, sx_ + 0.07, y + 0.31, y + 0.42, sz_ - 0.03, sz_ + 0.03, "steel")
        elif kind == "rack":
            # (a drying rack: two crossed-pole ends, a pole across them, a blanket and a pair of socks
            # hung over it to dry by the fire)
            for e in (-0.55, 0.55):
                for lean in (-0.28, 0.28):
                    cyl(rock, (x + e, y - 0.05, z + lean), (x + e, y + 1.0, z - lean * 0.15), 0.025, "timberDark", sides=4)
            cyl(rock, (x - 0.65, y + 0.95, z), (x + 0.65, y + 0.95, z), 0.022, "timber", sides=4)
            cloth = [rock.v(x - 0.4, y + 0.95, z + 0.01), rock.v(x + 0.15, y + 0.95, z + 0.01), rock.v(x + 0.15, y + 0.45, z + 0.06), rock.v(x - 0.4, y + 0.42, z + 0.05)]
            rock.facing(cloth, "bedroll", (0.0, 0.0, 1.0))
            cloth2 = [rock.v(x - 0.4, y + 0.42, z + 0.03), rock.v(x + 0.15, y + 0.45, z + 0.04), rock.v(x + 0.15, y + 0.95, z - 0.01), rock.v(x - 0.4, y + 0.95, z - 0.01)]
            rock.facing(cloth2, "bedroll", (0.0, 0.0, -1.0))
            for sxk in (0.3, 0.42):
                box(rock, x + sxk - 0.03, x + sxk + 0.03, y + 0.7, y + 0.95, z - 0.01, z + 0.02, "canvas")
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
    # (a sign at its head: the way down into the rift, docs/caverns-roadmap.md R7.4)
    sx_, sz_ = x - 1.15, zt - 0.6
    sy_ = G.y(sx_, sz_)
    cyl(rock, (sx_, sy_ - 0.1, sz_), (sx_, sy_ + 1.35, sz_), 0.04, "timberDark", sides=5)
    box(rock, sx_ - 0.36, sx_ + 0.36, sy_ + 0.95, sy_ + 1.3, sz_ + 0.04, sz_ + 0.08, "plank")
    for (u0, v0), (u1, v1) in (((0.0, 0.14), (0.0, -0.1)), ((-0.08, -0.02), (0.0, -0.12)), ((0.08, -0.02), (0.0, -0.12))):
        cyl(rock, (sx_ + u0, sy_ + 1.12 + v0, sz_ + 0.09), (sx_ + u1, sy_ + 1.12 + v1, sz_ + 0.09), 0.014, "timberDark", sides=3)
    for k2, colr in enumerate(("cyan", "violet")):
        prism(glow, (sx_ + 0.2 + 0.07 * k2, sy_ + 1.02, sz_ + 0.09), (0.2, 1.0, 0.3), 0.025, 0.12, colr, sides=4)

    # (the expedition's landing at the top, docs/caverns-roadmap.md R9.2: a plank deck built out from the
    # ledge beside the cage, flush with the cage's floor at the top, on stilts down to the rift's floor
    # and brackets into the cliff, a rail on its open sides; a rider steps off the cage onto it and
    # walks it to the ledge, never through the gantry)
    dx0, dx1, dz0, dz1 = x + 0.66, x + 2.15, zt + 0.05, zb + 0.6
    top_y = G.y(*Wn["upperAt"])
    for k in range(int((dz1 - dz0) / 0.22) + 1):
        z0_ = dz0 + k * 0.22
        z1_ = min(dz1, z0_ + 0.2)
        if z1_ <= z0_:
            continue
        box(rock, dx0, dx1 + 0.04 * ((k % 3) - 1), top_y - 0.07, top_y + 0.01, z0_, z1_, "plank" if k % 2 else "timber")
    for jx in (dx0 + 0.08, (dx0 + dx1) / 2, dx1 - 0.08):
        box(rock, jx - 0.06, jx + 0.06, top_y - 0.22, top_y - 0.07, dz0, dz1, "timberDark")
    # (stilts from the rift's floor under its open end, braced)
    for sx_, sz_ in ((dx0 + 0.1, dz1 - 0.12), (dx1 - 0.1, dz1 - 0.12), (dx1 - 0.1, (dz0 + dz1) / 2 + 0.3), (dx0 + 0.1, (dz0 + dz1) / 2 + 0.3)):
        gy = G.y(sx_, sz_)
        if gy < top_y - 0.4:
            cyl(rock, (sx_, gy - 0.1, sz_), (sx_, top_y - 0.2, sz_), 0.075, "timberDark", sides=6)
    for (ax_, az_), (bx_, bz_) in (((dx0 + 0.1, dz1 - 0.12), (dx1 - 0.1, dz1 - 0.12)), ((dx1 - 0.1, dz1 - 0.12), (dx1 - 0.1, (dz0 + dz1) / 2 + 0.3))):
        ga, gb = G.y(ax_, az_), G.y(bx_, bz_)
        cyl(rock, (ax_, ga + 0.4, az_), (bx_, top_y - 0.3, bz_), 0.04, "timber", sides=5)
        cyl(rock, (bx_, gb + 0.4, bz_), (ax_, top_y - 0.3, az_), 0.04, "timber", sides=5)
    # (brackets angled back into the cliff under its inner end)
    for bx_ in (dx0 + 0.2, dx1 - 0.2):
        cyl(rock, (bx_, top_y - 0.2, dz0 + 0.9), (bx_, top_y - 1.4, dz0 + 0.05), 0.05, "timberDark", sides=5)
    # (the rail: posts and a hand rail down its open east side and across its far end)
    rail_y = top_y + 0.85
    for rz_ in (dz0 + 0.15, (dz0 + dz1) / 2, dz1 - 0.08):
        cyl(rock, (dx1 - 0.04, top_y, rz_), (dx1 - 0.04, rail_y, rz_), 0.035, "timberDark", sides=5)
    cyl(rock, (dx1 - 0.04, rail_y, dz0 + 0.15), (dx1 - 0.04, rail_y, dz1 - 0.08), 0.03, "timber", sides=5)
    for rx_ in ((dx0 + dx1) / 2 + 0.2,):
        cyl(rock, (rx_, top_y, dz1 - 0.08), (rx_, rail_y, dz1 - 0.08), 0.035, "timberDark", sides=5)
    cyl(rock, (dx0 + 0.25, rail_y, dz1 - 0.08), (dx1 - 0.04, rail_y, dz1 - 0.08), 0.03, "timber", sides=5)
    # (a lantern on its far rail post)
    lantern(rock, glow, dx1 - 0.04, rail_y + 0.05, dz1 - 0.08, hang=0.2)

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
