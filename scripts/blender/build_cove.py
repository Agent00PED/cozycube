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
PALETTE.update({"CV_Wall": "#5E6470", "CV_WallDark": "#3A3F4A", "CV_WallWet": "#4A5A66", "CV_SandPale": "#EFE6D2", "CV_PearlGlow": "#BFF3FF", "CV_Clam": "#E8DCCB", "CV_ClamLip": "#C79AB0", "CV_ClamDark": "#8A7A70"})
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
                # (the sand darkens into the wall's shade at the back of the cave)
                c = mixc(c, wall, 0.75 * smooth(SCENE["floor"] - 2.6, SCENE["floor"] + 1.0, math.hypot(x, z)))
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
    idx = list(range(0, n + 1, 2))

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
    n = 46
    for k in range(n):
        a = 2 * math.pi * k / n
        x, z = math.cos(a) * (floor + 1.5), math.sin(a) * (floor + 1.5)
        if shore_at(x, z) < 1.5:
            continue
        s = rng.uniform(0.9, 1.25)
        y = land_y(x, z)
        h = rng.uniform(4.2, 6.4)
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
    boat_hull(bm, fr, 8.4, 2.8, (m("BC_Hull"), m("BC_HullTrim"), m("BC_HullUnder"), m("BC_Deck")))
    obox(bm, fr, -2.3, -0.5, 0.5, 2.0, -0.85, 0.85, m("BC_Hull"))
    obox(bm, fr, -0.5, -0.47, 1.25, 1.8, -0.7, 0.7, m("BC_Glass"))
    obox(bm, fr, -2.45, -0.3, 2.0, 2.08, -1.0, 1.0, m("BC_HullTrim"))
    bar(bm, fr.p(-1.4, 2.08, 0.0), fr.p(-1.4, 4.1, 0.0), 0.05, m("BC_WoodDark"), sides=6)
    lp = fr.p(-1.4, 4.2, 0.0)
    blob(bm, lp.x, lp.z, -lp.y, 0.08, 0.1, 0.08, m=m("BC_Lamp"), cuts=1)
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
        if made >= 60:
            break
        x, z = rng.uniform(-11, 11), rng.uniform(-11, 11)
        d = shore_at(x, z)
        if d < 0.2 or d > 4.5 or math.hypot(x, z) > SCENE["floor"] - 0.6:
            continue
        blob(deco, x, 0.015, z, rng.uniform(0.025, 0.06), 0.018, rng.uniform(0.02, 0.05), m=m(rng.choice(["BC_Shell", "BC_White", "BC_Stone", "CV_ClamLip"])), cuts=1)
        made += 1
    make_object("Cove_Deco", deco, MATS, coll, lift="parts")


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
