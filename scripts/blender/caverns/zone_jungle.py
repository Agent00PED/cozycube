"""The Doline Jungle under the collapse: its tall thin buttressed trees (dithered in the game), layered
canopies, lianas, ferns and leaf litter (`build_jungle`, `jungle_tree`, `vine`; `free_spot` finds
open ground)."""

import math
from .ground import free_spot, polyline_distance, SURF
from .kit import blob, cyl, fern, game_point, GEO_STATS, mixc, smooth
from .walls import wall_point


# ---------------------------------------------------------------------------------------------
# phase 3: each zone's own ground, plants and gear (docs/caverns-design.md): the Doline Jungle's tall
# trees, ferns and vines; the basecamp's gear; the breakdown's fallen slabs and gravel; the mudflats'
# cracked plates and ochre puddles; the terraces' cave pearls; the lake's crag, reeds and pebbles; the
# rift's basalt stubs, glowworms and fungi; the overlook's stalagmites


def jungle_tree(roots, G, x, z, h, lean, rng):
    """A tree of the Garden of Edam: a tall, narrow trunk reaching for the light, flared roots at its
    foot, a small crown up where the sun falls."""
    y = G.y(x, z)
    lx, lz = math.cos(lean) * 0.35, math.sin(lean) * 0.35
    pts = [(x, y - 0.3, z), (x + lx * 0.3, y + h * 0.35, z + lz * 0.3), (x + lx * 0.7, y + h * 0.7, z + lz * 0.7), (x + lx, y + h, z + lz)]
    for (a, ra), (b, rb) in zip(zip(pts, (0.24, 0.19, 0.15, 0.12)), zip(pts[1:], (0.19, 0.15, 0.12, 0.08))):
        cyl(roots, a, b, ra, "trunk", sides=7, r_end=rb)
    # (buttress roots: five flared fins down into the moss)
    for k in range(5):
        a = 2 * math.pi * k / 5 + lean + 0.3 * rng.random()
        reach = 0.75 + 0.35 * rng.random()
        foot = (x + math.cos(a) * reach, y - 0.08, z + math.sin(a) * reach)
        cyl(roots, foot, (x + math.cos(a) * 0.12, y + 0.95, z + math.sin(a) * 0.12), 0.09, "trunkDark", sides=4, r_end=0.03)
        cyl(roots, foot, (x + math.cos(a) * (reach + 0.35), y - 0.12, z + math.sin(a) * (reach + 0.35)), 0.05, "trunkDark", sides=4, r_end=0.02)
    tx, ty, tz = pts[-1]
    # (the canopy in layers: a dark underside, the crown round it, a lit top)
    for k in range(6):
        a = 2 * math.pi * k / 6 + lean
        s = 0.8 + 0.45 * rng.random()
        blob(roots, tx + math.cos(a) * 0.75, ty - 0.35 + 0.12 * (k % 2), tz + math.sin(a) * 0.75, s, s * 0.42, s, "canopyDark" if k % 3 == 0 else "canopy", cuts=1, noise=0.28, seed=k + int(x * 7))
    blob(roots, tx, ty + 0.25, tz, 1.1, 0.5, 1.1, "canopyLight", cuts=1, noise=0.25, seed=int(z * 5))
    # (lianas hanging from the crown)
    for k in range(2):
        a = lean + 1.6 + 2.6 * k
        vine(roots, tx + math.cos(a) * 1.0, ty - 0.3, tz + math.sin(a) * 1.0, (math.cos(a), math.sin(a)), 2.0 + 1.5 * rng.random(), rng)
    # (a branch or two out of the trunk's upper third)
    for k in range(2):
        a = lean + 2.2 * (k + 0.5)
        by = y + h * (0.62 + 0.12 * k)
        cyl(roots, (x + lx * 0.6, by, z + lz * 0.6), (x + math.cos(a) * 1.0, by + 0.8, z + math.sin(a) * 1.0), 0.05, "trunk", sides=4, r_end=0.03)
        blob(roots, x + math.cos(a) * 1.05, by + 0.9, z + math.sin(a) * 1.05, 0.55, 0.25, 0.55, "canopyLight", cuts=1, noise=0.2, seed=k)


def vine(rock, x0, y0, z0, out, length, rng):
    """A vine hanging down the wall from the collapse's lip: a thin stem zig-zagging down, leaves
    along it (both faces, seen from wherever)."""
    ox, oz = out
    px, py, pz = x0, y0, z0
    segs = max(3, int(length / 0.45))
    for j in range(segs):
        nx_ = px + (rng.random() - 0.5) * 0.25
        nz_ = pz + (rng.random() - 0.5) * 0.25
        ny = py - length / segs
        w = 0.035
        q = [rock.v(px - oz * w, py, pz + ox * w), rock.v(px + oz * w, py, pz - ox * w), rock.v(nx_ + oz * w, ny, nz_ - ox * w), rock.v(nx_ - oz * w, ny, nz_ + ox * w)]
        rock.face(q, "vine")
        rock.face([rock.v(*game_point(v.co)) for v in reversed(q)], "vine")
        if j % 2 == 0:
            s = 0.12 + 0.08 * rng.random()
            side = 1 if (j // 2) % 2 else -1
            lf = [rock.v(px, py - 0.05, pz), rock.v(px + ox * s * 0.6 - oz * s * side, py - s * 0.5, pz + oz * s * 0.6 + ox * s * side), rock.v(px + ox * s * 0.2, py - s, pz + oz * s * 0.2)]
            rock.face(lf, "vineLeaf")
            rock.face([rock.v(*game_point(v.co)) for v in reversed(lf)], "vineLeaf")
        px, py, pz = nx_, ny, nz_


def build_jungle(G, L, rock, roots, glow, rng):
    for x, z, h, lean in L["trees"]:
        jungle_tree(roots, G, x, z, h, lean, rng)
    # fallen leaves strewn over the moss: brown, amber and a few still green
    strewn = 0
    for _ in range(900):
        if strewn >= 160:
            break
        x, z = -21.6 + rng.random() * 12.6, -21.6 + rng.random() * 11.8
        if G.surf(x, z) != SURF["jungle"] or not free_spot(G, L, x, z, clear=0.35):
            continue
        y = G.y(x, z) + 0.02
        a = rng.random() * 2 * math.pi
        sz = 0.08 + 0.07 * rng.random()
        col = ("leafLitter", "leafAmber", "leafGreen", "leafLitter", "leafAmber")[strewn % 5]
        tri = [rock.v(x + math.cos(a) * sz, y, z + math.sin(a) * sz), rock.v(x + math.cos(a + 2.5) * sz * 0.55, y + 0.012, z + math.sin(a + 2.5) * sz * 0.55), rock.v(x + math.cos(a - 2.5) * sz * 0.55, y + 0.012, z + math.sin(a - 2.5) * sz * 0.55)]
        rock.facing(tri, col, (0.0, 1.0, 0.0))
        strewn += 1
    GEO_STATS["leaves"] = strewn
    # the daylight through the collapse: the sky over the jungle's broken rim (glowing, behind the walls
    # where they fell away), pale gold low and blue high
    half = L["half"]
    fy = G.y(-15.0, -20.0)
    for quad in (
        [(-half - 1.2, fy + 2.0, -half - 0.9), (-8.0, fy + 2.0, -half - 0.9), (-8.0, fy + 17.0, -half - 0.9), (-half - 1.2, fy + 17.0, -half - 0.9)],
        [(-half - 0.9, fy + 2.0, -11.5), (-half - 0.9, fy + 2.0, -half - 1.2), (-half - 0.9, fy + 17.0, -half - 1.2), (-half - 0.9, fy + 17.0, -11.5)],
    ):
        vs = []
        for x, y, z in quad:
            v = glow.v(x, y, z)
            glow.setv(v, mixc("skyLow", "skyHigh", smooth(fy + 4.0, fy + 15.0, y)))
            vs.append(v)
        glow.facing(vs, "skyLow", (0.6, 0.0, 0.6))
    # ferns: round the trees, the boulders and the rocks, along the stream's banks, at the walls' feet
    made = 0
    for _ in range(420):
        if made >= 46:
            break
        x, z = -21.4 + rng.random() * 12.0, -21.4 + rng.random() * 8.9
        if G.surf(x, z) != SURF["jungle"] or not free_spot(G, L, x, z, clear=0.9):
            continue
        near = min([math.hypot(x - a, z - b) for a, b, *_ in L["trees"] + L["boulders"]] + [22.5 + x, 22.5 + z, polyline_distance(x, z, L["river"]["segments"][0]) + 0.2])
        if near > 1.6 and rng.random() < 0.7:
            continue
        fern(rock, x, G.y(x, z), z, 0.3 + 0.18 * rng.random(), rng)
        made += 1
    GEO_STATS["ferns"] = made
    # vines down the walls from the collapse's lip (the north wall over the jungle, the west wall's)
    for k in range(9):
        u = -21.0 + k * 1.3 + rng.random() * 0.4
        top = wall_point(G, L, "x", u, 1.0, [])[0]
        vine(rock, u, top[1] - 0.2, top[2] + 0.5, (0.0, 1.0), 2.5 + 2.5 * rng.random(), rng)
    for k in range(6):
        u = -21.0 + k * 1.4 + rng.random() * 0.4
        top = wall_point(G, L, "z", u, 1.0, [])[0]
        vine(rock, top[0] + 0.5, top[1] - 0.2, u, (1.0, 0.0), 2.5 + 2.5 * rng.random(), rng)
