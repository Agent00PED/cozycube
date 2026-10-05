"""The Hidden Cove: builds client/public/models/cove.glb, the sea cave behind the rock stacks.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_cove.py

The ground's grid and every thing's place come from scripts/blender/data/cove_terrain.json, which
`npm run beach-terrain` writes from shared/worlds/cove.ts. The kit is Sunset Beach's
(build_beach.py, run here up to its `build`). Nodes:

    Cove_Ground   the cave's floor from the game's grid: pale sand round the lagoon, a wet band at
                  the waterline, the lagoon's bed darkening with depth (BC_Sand: vertex colours)
    Cove_Water    the lagoon and the sea beyond the cave's mouth: one sheet, its vertex colours data
                  for the game's shader (red: how far out from the waterline)
    Cove_Static   the cave's wall round the back (great rocks, darker toward their feet, stalactites
                  off their brows), the captain's boat in the lagoon, the old shipwright's bench, the
                  giant clams, the driftwood logs, shells and pebbles: one draw call a finish
    Cove_Glow     the pearl crystals in the wall and the glints on the wet rock (CV_PearlGlow: it
                  glows; the game breathes it)

The cave opens toward the camera (the south-east): no wall, no arch stands in front of the player.

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import math
import os
import random
import traceback

import bmesh
import bpy
from mathutils import Vector


def _repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_cove.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# Sunset Beach's kit (its palette, its frames and boxes, its finishes), run here up to its own `build`
_kit = open(os.path.join(_repo_root(), "scripts", "blender", "build_beach.py"), encoding="utf-8").read()
exec(compile(_kit[: _kit.index("\ndef build(root):")], "build_beach.py", "exec"), globals())

COLLECTION = "Cove"
repo_root = _repo_root
PALETTE.update({"CV_Wall": "#5E6470", "CV_WallDark": "#3A3F4A", "CV_WallWet": "#4A5A66", "CV_SandPale": "#EFE6D2", "CV_PearlGlow": "#BFF3FF", "CV_Clam": "#E8DCCB", "CV_ClamLip": "#C79AB0", "CV_ClamDark": "#8A7A70", "CV_WallLight": "#7C828E", "CV_Flow": "#BDB6A8", "CV_FlowDark": "#9A9488", "CV_Moss": "#5F8A5A", "CV_MossLight": "#86B070", "CV_Vine": "#3F7A4C", "CV_SandDamp": "#C4B598", "CV_Algae": "#8FAE8C", "CV_Litter": "#6E6654", "CV_Grit": "#A39A8C"})
EMISSION["CV_PearlGlow"] = 2.6
KEEP.add("CV_PearlGlow")
MATS = list(PALETTE)


def read_cove(root):
    with open(os.path.join(root, "scripts", "blender", "data", "cove_terrain.json"), encoding="utf-8") as f:
        return json.load(f)


def cove_ground(coll):
    """The cave's floor from the game's grid: a disc (the cave's own outline, a little past where the
    wall stands), pale sand, wet at the waterline, the lagoon's bed darkening with depth."""
    half, n, cell = TERRAIN["half"], TERRAIN["n"], TERRAIN["cell"]
    dry, wet, bed, deep = [lin(PALETTE[k]) for k in ("CV_SandPale", "BC_SandWet", "BC_Seabed", "BC_SeabedDeep")]
    wall = lin(PALETTE["CV_WallDark"])
    algae, grit, pale, damp, litter = [lin(PALETTE[k]) for k in ("CV_Algae", "CV_Grit", "BC_SandPale", "CV_SandDamp", "CV_Litter")]
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    verts = {}
    reach = SCENE["floor"] + 3.2

    def vert(i, k):
        v = verts.get((i, k))
        if v is None:
            x, z = -half + i * cell, -half + k * cell
            v = verts[(i, k)] = bm.verts.new(W(x, ground_y(x, z), z))
        return v

    for k in range(n):
        for i in range(n):
            x, z = -half + (i + 0.5) * cell, -half + (k + 0.5) * cell
            # (the floor under the wall and out through the cave's mouth; nothing behind the wall)
            if math.hypot(x, z) > reach and shore_at(x, z) > 0:
                continue
            a, b, c, d = vert(i, k), vert(i + 1, k), vert(i + 1, k + 1), vert(i, k + 1)
            for tri in ((a, c, b), (a, d, c)):
                f = bm.faces.new(tri)
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
                f.smooth = True
    for f in bm.faces:
        for loop in f.loops:
            x, z = loop.vert.co.x, -loop.vert.co.y
            d = shore_at(x, z)
            n1 = vnoise(x * 0.4 + 3.0, z * 0.4 - 7.0)
            if d < 0:
                c = mixc(mixc(wet, bed, smooth(0.0, 1.5, -d)), deep, smooth(1.0, 6.0, -d))
            else:
                c = mixc(dry, wet, smooth(1.4 + 0.5 * n1, 0.1, d))
                n2 = vnoise(x * 1.6 - 5.0, z * 1.6 + 2.0)
                # a thin green of algae where the lagoon laps, in patches
                c = mixc(c, algae, 0.45 * smooth(1.1, 0.2, d) * smooth(0.45, 0.75, n2))
                # shell grit left in a line a step up the sand
                c = mixc(c, grit, 0.4 * smooth(0.25, 0.0, abs(d - (1.9 + 0.5 * (n1 - 0.5)))) * smooth(0.3, 0.6, n2))
                # the sand under the skylight is dry and pale; toward the wall it is damp and dark
                sk = math.hypot(x - SCENE["skylight"]["x"], z - SCENE["skylight"]["z"])
                c = mixc(c, pale, 0.35 * smooth(4.2, 0.8, sk))
                c = mixc(c, damp, 0.7 * smooth(SCENE["floor"] - 4.2, SCENE["floor"] - 1.6, math.hypot(x, z)) * (0.7 + 0.3 * n1))
                # leaf litter under the ironwoods, stone grit round the pearl rock and the stalagmites
                for t in SCENE.get("ironwoods", []):
                    q = math.hypot(x - t["x"], z - t["z"])
                    if q < 2.3:
                        c = mixc(c, litter, 0.6 * smooth(2.3, 0.5, q) * (0.6 + 0.4 * n2))
                for t in SCENE.get("pearlRock", []) + SCENE.get("stalagmites", []):
                    q = math.hypot(x - t["x"], z - t["z"])
                    if q < 1.5:
                        c = mixc(c, grit, 0.5 * smooth(1.5, 0.4, q))
                # the ledge: bare rock up its shelf, the moon pool's rim wet stone
                lg = SCENE.get("ledge")
                if lg:
                    q = math.hypot(x - lg["x"], z - lg["z"])
                    c = mixc(c, mixc(lin(PALETTE["CV_WallLight"]), wall, 0.35 * n2), 0.92 * smooth(lg["flat"] + lg["skirt"] * 0.85, lg["flat"] + lg["skirt"] * 0.35, q))
                mp = SCENE.get("moonPool")
                if mp:
                    q = math.hypot(x - mp["x"], z - mp["z"]) - mp["r"]
                    c = mixc(c, lin(PALETTE["CV_WallWet"]), 0.6 * smooth(1.3, 0.1, q))
                    c = mixc(c, pale, 0.3 * smooth(4.0, 1.5, q))
                # (the sand darkens into the wall's shade at the back of the cave)
                c = mixc(c, wall, 0.75 * smooth(SCENE["floor"] - 1.6, SCENE["floor"] + 1.0, math.hypot(x, z)))
                # soft shade at the foot of what stands
                for t in SCENE.get("ironwoods", []):
                    q = math.hypot(x - t["x"] - 0.5, z - t["z"] + 0.2)
                    if q < 1.9:
                        c = [v * (1.0 - 0.2 * smooth(1.9, 0.6, q)) for v in c]
            k2 = 1.0 + 0.05 * (n1 - 0.5)
            loop[col] = (c[0] * k2, c[1] * k2, c[2] * k2, 1.0)
    me = bpy.data.meshes.new("Cove_GroundMesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(vc_material("BC_Sand"))
    use_col(me)
    ob = bpy.data.objects.new("Cove_Ground", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


def cove_water(coll):
    """The lagoon and the sea beyond the cave's mouth: the grid where the water shows, and a wide
    skirt out past the map."""
    half, n, cell = TERRAIN["half"], TERRAIN["n"], TERRAIN["cell"]
    shore = TERRAIN["shore"]
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    data = {}
    out_of = lambda s: max(0.0, min(1.0, (0.8 + s) / 12.0))

    def vert(x, z, r):
        v = bm.verts.new(W(x, 0.0, z))
        data[v] = (r, 0.0, 0.0, 1.0)
        return v

    made = {}
    # (cell for cell: the moon pool is narrow)
    idx = list(range(0, n + 1, 1))

    def gv(i, k):
        v = made.get((i, k))
        if v is None:
            # (the shader reads metres out from the waterline: the lagoon's shore distance, negated)
            v = made[(i, k)] = vert(-half + i * cell, -half + k * cell, out_of(-shore[k * (n + 1) + i]))
        return v

    for a, b in zip(idx, idx[1:]):
        for c, d in zip(idx, idx[1:]):
            corners = ((a, c), (b, c), (b, d), (a, d))
            if min(shore[q[1] * (n + 1) + q[0]] for q in corners) > 1.2:
                continue
            bm.faces.new([gv(*q) for q in corners])
    # out through the cave's mouth: a skirt on the south and the east
    for (x0, z0, x1, z1) in ((half, -half, SEA_OUT, SEA_OUT), (-half, half, half, SEA_OUT)):
        quad = [vert(x0, z0, 1.0), vert(x1, z0, 1.0), vert(x1, z1, 1.0), vert(x0, z1, 1.0)]
        bm.faces.new(quad)
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        f.smooth = True
        for loop in f.loops:
            loop[col] = data[loop.vert]
    me = bpy.data.meshes.new("Cove_WaterMesh")
    bm.to_mesh(me)
    bm.free()
    mat = vc_material("BC_Sea")
    mat.use_backface_culling = False
    me.materials.append(mat)
    use_col(me)
    ob = bpy.data.objects.new("Cove_Water", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


def cove_wall(coll, rng):
    """The cave's wall round the back: great rocks shoulder to shoulder where the floor ends, wherever
    that is on land (the cave's mouth, toward the camera, stays open), stalactites off their brows."""
    floor = SCENE["floor"]
    bm = bmesh.new()
    glow = bmesh.new()
    # (as many great rocks as it takes to stand shoulder to shoulder round the floor)
    n = int(round(46 * floor / 10.4))
    for k in range(n):
        a = 2 * math.pi * k / n
        x, z = math.cos(a) * (floor + 1.5), math.sin(a) * (floor + 1.5)
        if shore_at(x, z) < 1.5:
            continue
        s = rng.uniform(0.9, 1.25)
        y = land_y(x, z)
        h = rng.uniform(4.8, 7.4)
        blob(bm, x, y + h * 0.42, z, 1.55 * s, h * 0.6, 1.5 * s, m=m("CV_Wall"), cuts=3, noise=0.26, rng=rng, flat_bottom=y - 0.4)
        blob(bm, x * 1.12, y + h * 0.75, z * 1.12, 1.9 * s, h * 0.55, 1.8 * s, m=m("CV_WallDark"), cuts=3, noise=0.24, rng=rng, flat_bottom=y - 0.4)
        # (wet rock at its foot, a stalactite or two off its brow)
        blob(bm, x * 0.93, y + 0.35, z * 0.93, 0.8 * s, 0.5, 0.75 * s, m=m("CV_WallWet"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.2)
        if k % 2 == 0:
            tip = W(x * 0.9, y + h * 0.62, z * 0.9)
            cylinder(bm, W(x * 0.9, y + h * 0.98, z * 0.9), tip, 0.22 * s, sides=6, m=m("CV_WallDark"), r_end=0.03)
        if k % 3 == 1:
            gx, gz = x * 0.9, z * 0.9
            blob(glow, gx, y + rng.uniform(1.2, 2.6), gz, 0.07, 0.11, 0.07, m=m("CV_PearlGlow"), cuts=1)
        # a ledge of paler rock across its face: the beds the cave was cut through
        ly = y + rng.uniform(1.4, 2.6)
        blob(bm, x * 0.9, ly, z * 0.9, 1.25 * s, 0.22, 1.2 * s, m=m("CV_WallLight"), cuts=2, noise=0.22, rng=rng)
        # smaller rocks at its foot, between it and the next
        a2 = a + math.pi / n
        fx, fz = math.cos(a2) * (floor + 0.55), math.sin(a2) * (floor + 0.55)
        if shore_at(fx, fz) > 1.2:
            fy = land_y(fx, fz)
            blob(bm, fx, fy + 0.3, fz, rng.uniform(0.5, 0.85), rng.uniform(0.4, 0.75), rng.uniform(0.5, 0.8), m=m("CV_WallWet") if k % 2 else m("CV_Wall"), cuts=2, noise=0.24, rng=rng, flat_bottom=fy - 0.2)
        # more stalactites, each its own length, off the brow and the ledge
        for q in range(rng.randint(1, 3)):
            ta = a + rng.uniform(-0.05, 0.05)
            tr = (floor + 1.5) * rng.uniform(0.84, 0.95)
            tx, tz = math.cos(ta) * tr, math.sin(ta) * tr
            top = y + h * rng.uniform(0.8, 1.0)
            cylinder(bm, W(tx, top, tz), W(tx, top - rng.uniform(0.5, 1.6), tz), rng.uniform(0.09, 0.2) * s, sides=5, m=m("CV_WallDark") if q % 2 else m("CV_Flow"), r_end=0.02)
        # flowstone: a pale curtain down the rock here and there
        if k % 5 == 2:
            for q in range(4):
                fa = a + (q - 1.5) * 0.035
                r0 = (floor + 1.5) * 0.9
                cylinder(bm, W(math.cos(fa) * r0, y + h * 0.7, math.sin(fa) * r0), W(math.cos(fa) * (r0 - 0.25), y + 0.5 + 0.2 * q, math.sin(fa) * (r0 - 0.25)), 0.16, sides=5, m=m("CV_Flow") if q % 2 else m("CV_FlowDark"), r_end=0.09)
        # under the skylight the rock is green: moss on the ledges, vines hanging down
        sk = math.hypot(x - SCENE["skylight"]["x"], z - SCENE["skylight"]["z"])
        if sk < 8.5:
            for q in range(3):
                ma = a + rng.uniform(-0.06, 0.06)
                mr = (floor + 1.5) * rng.uniform(0.86, 0.93)
                blob(bm, math.cos(ma) * mr, ly + rng.uniform(-0.6, 0.9), math.sin(ma) * mr, rng.uniform(0.35, 0.7), 0.16, rng.uniform(0.3, 0.6), m=m("CV_Moss") if q % 2 else m("CV_MossLight"), cuts=1, noise=0.2, rng=rng)
            if k % 2 == 0:
                va = a + rng.uniform(-0.04, 0.04)
                vr = (floor + 1.5) * 0.88
                vx, vz = math.cos(va) * vr, math.sin(va) * vr
                v0 = y + h * 0.78
                ln = rng.uniform(1.3, 2.6)
                cylinder(bm, W(vx, v0, vz), W(vx * 0.985, v0 - ln, vz * 0.985), 0.022, sides=4, m=m("CV_Vine"), r_end=0.012)
                for j in range(int(ln / 0.35)):
                    blob(bm, vx * (1 - 0.004 * j) + rng.uniform(-0.06, 0.06), v0 - 0.3 - j * 0.35, vz * (1 - 0.004 * j) + rng.uniform(-0.06, 0.06), 0.09, 0.05, 0.09, m=m("CV_MossLight") if j % 2 else m("CV_Moss"), cuts=1)
        # glowworms: a little cluster of lights on the dark rock
        if k % 2 == 0:
            ga = a + rng.uniform(-0.05, 0.05)
            gr = (floor + 1.5) * 0.885
            for q in range(rng.randint(4, 8)):
                blob(glow, math.cos(ga + rng.uniform(-0.03, 0.03)) * gr, y + h * rng.uniform(0.45, 0.72), math.sin(ga + rng.uniform(-0.03, 0.03)) * gr, 0.022, 0.022, 0.022, m=m("CV_PearlGlow"), cuts=1)
    # the pearl crystals at the wall's foot (you walk round them)
    for x, z, s in SCENE["crystals"]:
        y = land_y(x, z)
        blob(bm, x, y + 0.2 * s, z, 0.55 * s, 0.35 * s, 0.5 * s, m=m("CV_WallWet"), cuts=2, noise=0.2, rng=rng, flat_bottom=y - 0.2)
        for q in range(5):
            t = 1.3 * q + s
            lean = Vector((math.cos(t) * 0.25, -math.sin(t) * 0.25, 1.0)).normalized()
            base = W(x + math.cos(t) * 0.2 * s, y + 0.25 * s, z + math.sin(t) * 0.2 * s)
            cylinder(glow, base, base + lean * rng.uniform(0.45, 0.95) * s, 0.09 * s, sides=5, m=m("CV_PearlGlow"), r_end=0.015)
    make_object("Cove_Wall", bm, MATS, coll)
    make_object("Cove_Glow", glow, MATS, coll)


def cove_things(coll, cushions, rng):
    S = SCENE
    bm = bmesh.new()
    # the captain's boat, bow to the sand
    B = S["boat"]
    fr = Frame(B["x"], B["z"], B["yaw"], y=-0.08)
    deck_at = boat_hull(bm, fr, 8.6, 2.9, (m("BC_Hull"), m("BC_HullTrim"), m("BC_HullUnder"), m("BC_Deck")))
    boat_fittings(bm, fr, deck_at, rng)
    # stalagmites along the wall's foot: each a wet cone with a smaller one against it
    for st in S.get("stalagmites", []):
        y = land_y(st["x"], st["z"])
        k = st["s"]
        cylinder(bm, W(st["x"], y - 0.1, st["z"]), W(st["x"] + 0.04 * k, y + 1.25 * k, st["z"]), 0.3 * k, sides=7, m=m("CV_Wall"), r_end=0.04)
        cylinder(bm, W(st["x"], y - 0.1, st["z"]), W(st["x"], y + 0.3 * k, st["z"]), 0.36 * k, sides=7, m=m("CV_WallWet"), r_end=0.26 * k)
        cylinder(bm, W(st["x"] + 0.3 * k, y - 0.1, st["z"] + 0.18 * k), W(st["x"] + 0.32 * k, y + 0.6 * k, st["z"] + 0.18 * k), 0.16 * k, sides=6, m=m("CV_Flow"), r_end=0.03)
    # the old boat the shipwright never finished: a keel and its ribs, half under the sand
    Wk = S.get("wreck")
    if Wk:
        fw = Frame(Wk["x"], Wk["z"], Wk["yaw"])
        bar(bm, fw.p(-1.5, 0.05, 0.0), fw.p(1.5, 0.16, 0.0), 0.07, m("BC_DriftDark"), sides=6, r_end=0.05)
        bar(bm, fw.p(1.5, 0.16, 0.0), fw.p(1.85, 0.75, 0.0), 0.06, m("BC_DriftDark"), sides=6, r_end=0.04)
        for j in range(6):
            a_ = -1.2 + j * 0.48
            w_ = 0.55 * math.sin(math.pi * (j + 1) / 7) + 0.18
            hgt = 0.5 + 0.25 * math.sin(math.pi * (j + 1) / 7) - (0.25 if j in (1, 4) else 0.0)
            for side_ in (-1, 1):
                if side_ < 0 and j % 3 == 2:
                    continue
                bar(bm, fw.p(a_, 0.08, 0.0), fw.p(a_, 0.2, side_ * w_ * 0.75), 0.04, m("BC_Drift"), sides=5)
                bar(bm, fw.p(a_, 0.2, side_ * w_ * 0.75), fw.p(a_, hgt, side_ * w_), 0.04, m("BC_Drift"), sides=5, r_end=0.025)
        obox(bm, fw, -0.9, 0.5, 0.3, 0.34, 0.5, 0.62, m("BC_DriftDark"))
    # lantern posts: a driftwood pole, an arm, a lamp hung from it
    for lp_ in S.get("lanterns", []):
        y = land_y(lp_["x"], lp_["z"])
        bar(bm, W(lp_["x"], y - 0.05, lp_["z"]), W(lp_["x"], y + 1.7, lp_["z"]), 0.05, m("BC_WoodDark"), sides=6, r_end=0.04)
        bar(bm, W(lp_["x"], y + 1.62, lp_["z"]), W(lp_["x"] + 0.32, y + 1.7, lp_["z"] + 0.1), 0.025, m("BC_WoodDark"), sides=5)
        lathe(bm, lp_["x"] + 0.32, lp_["z"] + 0.1, [(0.0, 0.0), (0.07, 0.0), (0.085, 0.14), (0.05, 0.2), (0.0, 0.21)], segs=8, m=m("BC_Lamp"), y0=y + 1.4)
    # a gangplank from her bow to the sand
    c = S["captain"]
    bow = fr.p(4.1, 0.72, 0.0)
    shore = W(c["x"] + (B["x"] - c["x"]) * 0.2, land_y(c["x"], c["z"]) + 0.04, c["z"] + (B["z"] - c["z"]) * 0.2)
    side = Vector((-(shore - bow).y, (shore - bow).x, 0)).normalized() * 0.28
    hexa(bm, [bow - side, bow + side, shore + side, shore - side], Vector((0, 0, 0.05)), m=m("BC_Wood"), m_under=m("BC_WoodDark"))
    # the old shipwright's bench: a heavy top on trestles, tools, a half-carved rod, a lantern
    Bn = S["bench"]
    fb = Frame(Bn["x"], Bn["z"], Bn["yaw"])
    obox(bm, fb, -0.38, 0.38, 0.82, 0.92, -0.95, 0.95, m("BC_Wood"))
    for b in (-0.75, 0.75):
        obox(bm, fb, -0.3, 0.3, 0.0, 0.82, b - 0.06, b + 0.06, m("BC_WoodDark"))
    obox(bm, fb, -0.3, 0.3, 0.3, 0.36, -0.75, 0.75, m("BC_WoodDark"))
    bar(bm, fb.p(0.0, 0.96, -0.8), fb.p(0.1, 0.99, 0.6), 0.025, m("BC_Bamboo"), sides=6, r_end=0.012)
    obox(bm, fb, -0.25, -0.05, 0.92, 1.0, 0.55, 0.85, m("BC_Iron"))
    p = fb.p(0.2, 0.92, -0.2)
    blob(bm, p.x, p.z + 0.05, -p.y, 0.07, 0.05, 0.07, m=m("BC_White"), cuts=1)
    lp = fb.p(-0.2, 0.92, -0.75)
    lathe(bm, lp.x, -lp.y, [(0.0, 0.0), (0.07, 0.0), (0.08, 0.14), (0.05, 0.2), (0.0, 0.21)], segs=8, m=m("BC_Lamp"), y0=lp.z)
    # behind the bench: a barrel, a crate of fittings, a coil of rope, planks leant on the trestle
    bp = fb.p(-0.85, 0.0, -0.6)
    lathe(bm, bp.x, -bp.y, [(0.0, 0.0), (0.2, 0.0), (0.24, 0.3), (0.2, 0.6), (0.0, 0.6)], segs=10, m=m("BC_Wood"), y0=bp.z)
    obox(bm, fb, -1.05, -0.6, 0.0, 0.4, 0.2, 0.75, m("BC_WoodPale"))
    rp = fb.p(-0.75, 0.4, 0.45)
    lathe(bm, rp.x, -rp.y, [(0.0, 0.0), (0.16, 0.0), (0.16, 0.06), (0.07, 0.06), (0.07, 0.0), (0.0, 0.0)], segs=10, m=m("BC_Rope"), y0=rp.z)
    for q in range(3):
        bar(bm, fb.p(0.5, 0.02, 1.15 + 0.12 * q), fb.p(-0.2, 1.1, 1.05 + 0.1 * q), 0.035, m("BC_WoodPale") if q % 2 else m("BC_Wood"), sides=4)
    # the giant clams: two fluted shells a little open, a pale lip between them
    for cl in S["clams"]:
        fc = Frame(cl["x"], cl["z"], cl["yaw"])
        y0 = 0.0
        for side, tilt in ((1, 0.28), (-1, -0.1)):
            ribs = 9
            rim = []
            for q in range(ribs + 1):
                t = math.pi * q / ribs
                r = 0.42 * (1.0 + 0.09 * math.cos(q * math.pi))
                rim.append(fc.p(math.cos(t) * r * 0.2 + 0.05, y0 + 0.14 + side * (0.1 + tilt * math.sin(t)), (q / ribs - 0.5) * 0.8))
            hinge = fc.p(-0.26, y0 + 0.1, 0.0)
            belly = fc.p(-0.06, y0 + 0.12 + side * 0.24, 0.0)
            for q in range(ribs):
                bm.faces.new([bm.verts.new(hinge), bm.verts.new(rim[q]), bm.verts.new(belly)]).material_index = m("CV_Clam") if q % 2 else m("CV_ClamDark")
                bm.faces.new([bm.verts.new(belly), bm.verts.new(rim[q]), bm.verts.new(rim[q + 1])]).material_index = m("CV_Clam") if q % 2 else m("CV_ClamDark")
        lip = fc.p(0.02, y0 + 0.15, 0.0)
        blob(bm, lip.x, lip.z, -lip.y, 0.1, 0.045, 0.3, m=m("CV_ClamLip"), cuts=2)
    # the driftwood logs to sit on
    log = cushions["log"]
    for g in S["logs"]:
        fl = Frame(g["x"], g["z"], g["yaw"])
        bar(bm, fl.p(0.0, log["y"], -0.55), fl.p(0.0, log["y"], 0.55), log["h"] / 2, m("BC_Drift"), sides=10, r_end=log["h"] / 2 * 0.9)
    make_object("Cove_Things", bm, MATS, coll)
    # shells and pebbles on the wet sand (walked over)
    deco = bmesh.new()
    made = 0
    for _ in range(3000):
        if made >= 150:
            break
        x, z = rng.uniform(-11, 11), rng.uniform(-11, 11)
        d = shore_at(x, z)
        if d < 0.2 or d > 4.5 or math.hypot(x, z) > SCENE["floor"] - 0.6:
            continue
        if made % 14 == 0:
            for q in range(5):
                a_ = 2 * math.pi * q / 5
                blob(deco, x + 0.05 * math.cos(a_), 0.012, z + 0.05 * math.sin(a_), 0.045, 0.012, 0.02, m=m("BC_Star"), cuts=1)
        elif made % 5 == 0 and d < 1.3:
            blob(deco, x, 0.012, z, rng.uniform(0.06, 0.14), 0.014, rng.uniform(0.03, 0.07), m=m("BC_Weed"), cuts=1)
        else:
            blob(deco, x, 0.015, z, rng.uniform(0.025, 0.06), 0.018, rng.uniform(0.02, 0.05), m=m(rng.choice(["BC_Shell", "BC_White", "BC_Stone", "CV_ClamLip", "CV_Grit"])), cuts=1)
        made += 1
    make_object("Cove_Deco", deco, MATS, coll, lift="parts")


def cove_remake(coll, rng):
    """The remake's own: the moon pool's rim of stones and its glowing bed, the ledge's rock steps,
    its stone bench and the rocks at its back."""
    bm = bmesh.new()
    glow = bmesh.new()
    mp = SCENE["moonPool"]
    for q in range(13):
        a = 2 * math.pi * q / 13 + rng.uniform(-0.15, 0.15)
        r = mp["r"] + rng.uniform(0.1, 0.45)
        x, z = mp["x"] + math.cos(a) * r, mp["z"] + math.sin(a) * r
        sz = rng.uniform(0.16, 0.36)
        blob(bm, x, land_y(x, z) + sz * 0.3, z, sz, sz * 0.6, sz * rng.uniform(0.7, 1.1), m=m(("CV_WallWet", "CV_Wall", "CV_WallLight")[q % 3]), cuts=2, noise=0.22, rng=rng)
    # pearls of light on its bed (the roof's glowworms answered from below)
    for q in range(7):
        a, r = rng.random() * 6.283, rng.uniform(0.2, mp["r"] * 0.75)
        x, z = mp["x"] + math.cos(a) * r, mp["z"] + math.sin(a) * r
        blob(glow, x, ground_y(x, z) + 0.05, z, 0.06, 0.05, 0.06, m=m("CV_PearlGlow"), cuts=1)
    lg = SCENE["ledge"]
    y = land_y(lg["x"], lg["z"])
    # the shelf's back: rocks stood behind the bench, away from the lagoon
    lx, lz = SCENE["lagoon"]["x"] - lg["x"], SCENE["lagoon"]["z"] - lg["z"]
    ll = math.hypot(lx, lz) or 1.0
    ox, oz = -lx / ll, -lz / ll
    for q, (off, s) in enumerate(((-1.6, 1.0), (-0.5, 1.3), (0.7, 1.1), (1.7, 0.9))):
        x, z = lg["x"] + ox * 1.5 - oz * off, lg["z"] + oz * 1.5 + ox * off
        blob(bm, x, land_y(x, z) + 0.7 * s, z, 0.85 * s, 1.1 * s, 0.8 * s, m=m("CV_Wall") if q % 2 else m("CV_WallDark"), cuts=3, noise=0.24, rng=rng, flat_bottom=land_y(x, z) - 0.3)
    # the bench: a slab on two stones, facing the lagoon
    for seat in SCENE["ledgeSeats"]:
        blob(bm, seat["x"] - ox * 0.0, land_y(seat["x"], seat["z"]) + 0.2, seat["z"], 0.3, 0.2, 0.26, m=m("CV_WallDark"), cuts=2, noise=0.15, rng=rng, flat_bottom=land_y(seat["x"], seat["z"]) - 0.1)
    sa, sb = SCENE["ledgeSeats"][0], SCENE["ledgeSeats"][1]
    top = max(land_y(sa["x"], sa["z"]), land_y(sb["x"], sb["z"])) + 0.42
    dx, dz = sb["x"] - sa["x"], sb["z"] - sa["z"]
    dl = math.hypot(dx, dz) or 1.0
    ex, ez = dx / dl * 0.45, dz / dl * 0.45
    px, pz = -dz / dl * 0.28, dx / dl * 0.28
    pts = [W(sa["x"] - ex - px, top, sa["z"] - ez - pz), W(sb["x"] + ex - px, top, sb["z"] + ez - pz), W(sb["x"] + ex + px, top, sb["z"] + ez + pz), W(sa["x"] - ex + px, top, sa["z"] - ez + pz)]
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    f.material_index = m("CV_WallLight")
    low = [bm.verts.new((p.x, p.y, p.z - 0.09)) for p in pts]
    hi = list(f.verts)
    for i in range(4):
        side = bm.faces.new((hi[i], hi[(i + 1) % 4], low[(i + 1) % 4], low[i]))
        side.material_index = m("CV_Wall")
    # a few glowworm threads' lights under the roof's second break, over the pool
    for q in range(9):
        a, r = rng.random() * 6.283, rng.uniform(0.3, 2.6)
        blob(glow, mp["x"] + math.cos(a) * r, 5.2 + rng.uniform(0.0, 1.6), mp["z"] + math.sin(a) * r, 0.05, 0.09, 0.05, m=m("CV_PearlGlow"), cuts=1)
    make_object("Cove_Remake", bm, MATS, coll)
    make_object("Cove_RemakeGlow", glow, MATS, coll)


def fuse_cove(coll):
    statics = []
    for ob in list(coll.all_objects):
        if ob.type != "MESH" or ob.name in ("Cove_Ground", "Cove_Water"):
            continue
        bake_colors(ob)
        if ob.name == "Cove_Glow":
            continue
        statics.append(ob)
    bpy.context.view_layer.update()
    target = statics[0]
    if len(statics) > 1:
        with bpy.context.temp_override(object=target, active_object=target, selected_objects=statics, selected_editable_objects=statics):
            bpy.ops.object.join()
    target.name = "Cove_Static"
    target.data.name = "Cove_StaticMesh"
    use_col(target.data)
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    return {"objects": len(meshes), "drawCalls": sum(len(o.data.materials) for o in meshes), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)}


def build(root):
    purge()
    global TERRAIN, SCENE
    TERRAIN = read_cove(root)
    SCENE = TERRAIN["scene"]
    cushions = read_beach_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rng = random.Random(53)
    cove_ground(coll)
    cove_water(coll)
    cove_wall(coll, rng)
    cove_things(coll, cushions, rng)
    cove_remake(coll, rng)
    return coll


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll = build(root)
        fused = fuse_cove(coll)
        out = os.path.join(root, "client", "public", "models", "cove.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), "fused": fused}
        import importlib, sys
        here = os.path.join(root, "scripts", "blender")
        if here not in sys.path:
            sys.path.insert(0, here)
        import meshopt_pack as _pack
        result["meshopt"] = importlib.reload(_pack).meshopt_pack(root, out)
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1)[:3000])
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
