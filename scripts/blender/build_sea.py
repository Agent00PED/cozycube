"""The Open Sea: builds client/public/models/sea.glb, the captain's boat at anchor in open water.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_sea.py

Everything comes from scripts/blender/data/sea_scene.json, which `npm run beach-terrain` writes from
shared/worlds/sea.ts (the boat is written in its own frame there: `a` toward the bow, `b` to
starboard). The kit is Sunset Beach's (build_beach.py, run here up to its `build`). Nodes:

    Sea_Water     the sea: one wide sheet at the waterline, its vertex colours data for the game's
                  shader (red 1: deep water everywhere)
    Sea_Static    the boat (its hull, its flat deck inside the bulwarks, the wheelhouse and its
                  wheel, the mast and its boom, the benches, crates, rod holders, nets) and the far
                  rock stacks, one draw call a finish

The deck is flat at the game's DECK_Y and never moves: the game moves the swell round it.

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
    if "__file__" in globals() and __file__.endswith("build_sea.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# Sunset Beach's kit (its palette, its frames and boxes, its finishes), run here up to its own `build`
_kit = open(os.path.join(_repo_root(), "scripts", "blender", "build_beach.py"), encoding="utf-8").read()
exec(compile(_kit[: _kit.index("\ndef build(root):")], "build_beach.py", "exec"), globals())

COLLECTION = "Sea"
repo_root = _repo_root
SEA = None  # sea_scene.json (set by build)


def land_y(x, z):
    """Nothing here stands on ground: everything is built at its own height."""
    return 0.0


def build_water(coll):
    """One wide sheet of deep water (red 1 in its vertex colours: the shader's open sea), cut a
    little finer near the boat so the swell bends."""
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    n, half = 60, SEA_OUT
    S = SEA
    out = S["outline"]
    bx, bz = math.sin(S["bowYaw"]), math.cos(S["bowYaw"])
    sx, sz = S["starboard"]["x"], S["starboard"]["z"]

    def hull_out(x, z):
        """Metres outside the hull's waterline (negative: under her)."""
        a, b = x * bx + z * bz, abs(x * sx + z * sz)
        if a < out[0][0]:
            return math.hypot(out[0][0] - a, max(0.0, b - out[0][1] - 0.16))
        if a > out[-1][0]:
            return math.hypot(a - out[-1][0], max(0.0, b - out[-1][1]))
        for (pa, pb), (qa, qb) in zip(out, out[1:]):
            if pa <= a <= qa:
                return b - (pb + (qb - pb) * (a - pa) / (qa - pa)) - 0.16
        return 9.0
    verts = {}
    for k in range(n + 1):
        for i in range(n + 1):
            # (finer in the middle: the grid's lines bunch toward the boat)
            u, v = i / n * 2 - 1, k / n * 2 - 1
            x = half * (abs(u) ** 2.6) * (1 if u >= 0 else -1)
            z = half * (abs(v) ** 2.6) * (1 if v >= 0 else -1)
            verts[(i, k)] = bm.verts.new(W(x, 0.0, z))
    for k in range(n):
        for i in range(n):
            f = bm.faces.new((verts[(i, k)], verts[(i + 1, k)], verts[(i + 1, k + 1)], verts[(i, k + 1)]))
            f.smooth = True
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        for loop in f.loops:
            # (red: how far out from the hull, as the shader reads a shore: the sea laps white along
            # the boat's waterline and is a shade paler for a stride round her, then deep)
            x, z = loop.vert.co.x, -loop.vert.co.y
            ho = hull_out(x, z)
            # (a hand's width of foam at her side, deep water again within a stride: never a pale shoal)
            loop[col] = (max(0.0, min(1.0, (1.0 + 10.0 * max(0.0, ho) ** 0.8) / 12.0)) if ho < 1.4 else 1.0, 0.0, 0.0, 1.0)
    me = bpy.data.meshes.new("Sea_WaterMesh")
    bm.to_mesh(me)
    bm.free()
    mat = vc_material("BC_Sea")
    mat.use_backface_culling = False
    me.materials.append(mat)
    use_col(me)
    ob = bpy.data.objects.new("Sea_Water", me)
    coll.objects.link(ob)
    ob["origin"] = [0.0, 0.0, 0.0]


def build_boat(coll, rng):
    """The captain's boat: lofted from the deck's own outline (the game's), a flat deck inside
    bulwarks, the wheelhouse aft, the mast amidships."""
    S = SEA
    deck = S["deckY"]
    fr = Frame(0.0, 0.0, S["bowYaw"], y=0.0)
    # (the game's `b` runs to starboard, the camera's side)
    fr.rx, fr.rz = S["starboard"]["x"], S["starboard"]["z"]
    out = S["outline"]  # [a, half-beam] from stern to bow
    bm = bmesh.new()
    rail = deck + 0.42

    def ring(scale, y, push=0.0):
        """The hull's outline at a height: starboard from stern to bow, then port back."""
        pts = [(a, hb * scale + push) for a, hb in out]
        return [fr.p(a, y, b) for a, b in pts] + [fr.p(a, y, -b) for a, b in reversed(pts)]

    # the hull: from the rail down past the waterline, tucked in toward the keel
    rows = [ring(1.0, rail, 0.16), ring(1.0, deck - 0.1, 0.16), ring(0.94, 0.12, 0.1), ring(0.72, -0.45, 0.0), ring(0.3, -0.85, 0.0)]
    vr = [[bm.verts.new(p) for p in row] for row in rows]
    n = len(vr[0])
    bands = ("BC_HullTrim", "BC_Hull", "BC_Hull", "BC_HullUnder")
    for k, (r0, r1) in enumerate(zip(vr, vr[1:])):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = m(bands[k])
            f.smooth = k > 0
    bm.faces.new(list(reversed(vr[-1]))).material_index = m("BC_HullUnder")
    # (the hull's faces worked out to face outward; its finishes are drawn from both sides besides)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # a rubbing strake along the sheer, the stem post up the bow, the rudder under the stern
    strake_o = [bm.verts.new(p) for p in ring(1.0, deck + 0.02, 0.2)]
    strake_i = [bm.verts.new(p) for p in ring(1.0, deck - 0.1, 0.2)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((strake_o[i], strake_o[j], strake_i[j], strake_i[i])).material_index = m("BC_HullTrim")
    bar(bm, fr.p(out[-1][0] + 0.1, -0.7, 0.0), fr.p(out[-1][0] + 0.32, rail + 0.3, 0.0), 0.08, m("BC_WoodDark"), sides=5, r_end=0.05)
    obox(bm, fr, out[0][0] - 0.35, out[0][0] - 0.05, -0.9, 0.25, -0.035, 0.035, m("BC_WoodDark"))
    # the bulwarks' inner faces and their cap rail
    inner_top = [bm.verts.new(p) for p in ring(1.0, rail, 0.02)]
    inner_bot = [bm.verts.new(p) for p in ring(1.0, deck, 0.02)]
    outer_top = [bm.verts.new(p) for p in ring(1.0, rail + 0.04, 0.2)]
    cap_in = [bm.verts.new(p) for p in ring(1.0, rail + 0.04, -0.02)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((inner_bot[i], inner_bot[j], inner_top[j], inner_top[i])).material_index = m("BC_Hull")
        bm.faces.new((cap_in[i], cap_in[j], outer_top[j], outer_top[i])).material_index = m("BC_WoodDark")
    # the deck: planks from stern to bow, each cut to the deck's width there
    a0, a1 = out[0][0], out[-1][0]

    def half_at(a):
        for (pa, pb), (qa, qb) in zip(out, out[1:]):
            if pa <= a <= qa:
                return pb + (qb - pb) * (a - pa) / (qa - pa)
        return out[-1][1]

    step = 0.3
    a = a0
    k = 0
    while a < a1 - 1e-6:
        an = min(a1, a + step)
        w0, w1 = half_at(a) + 0.03, half_at(an) + 0.03
        quad = [fr.p(a, deck, -w0), fr.p(a, deck, w0), fr.p(an, deck, w1), fr.p(an, deck, -w1)]
        bm.faces.new([bm.verts.new(p) for p in quad]).material_index = m("BC_Deck") if k % 2 else m("BC_WoodPale")
        a = an
        k += 1
    # the wheelhouse: walls, windows on every side but aft, a roof with an overhang, the wheel
    Wh = S["wheelhouse"]
    h0, h1, hw = Wh["a0"], Wh["a1"], Wh["half"]
    obox(bm, fr, h0, h1, deck, deck + 1.85, -hw, hw, m("BC_Hull"))
    obox(bm, fr, h1, h1 + 0.02, deck + 0.95, deck + 1.55, -hw + 0.12, hw - 0.12, m("BC_Glass"))
    for b in (-hw - 0.02, hw):
        obox(bm, fr, h0 + 0.3, h1 - 0.25, deck + 0.95, deck + 1.55, b, b + 0.02, m("BC_Glass"))
    obox(bm, fr, h0 - 0.15, h1 + 0.35, deck + 1.85, deck + 1.95, -hw - 0.18, hw + 0.18, m("BC_HullTrim"))
    obox(bm, fr, h0, h0 + 0.02, deck, deck + 1.6, -0.3, 0.3, m("BC_WoodDark"))
    wheel = fr.p(h1 + 0.2, deck + 1.0, 0.0)
    bar(bm, fr.p(h1 + 0.02, deck + 1.0, 0.0), wheel, 0.03, m("BC_WoodDark"), sides=6)
    for q in range(8):
        t = 2 * math.pi * q / 8
        spoke = fr.p(h1 + 0.2, deck + 1.0 + 0.26 * math.cos(t), 0.26 * math.sin(t))
        bar(bm, wheel, spoke, 0.014, m("BC_Wood"), sides=4)
        nxt = fr.p(h1 + 0.2, deck + 1.0 + 0.22 * math.cos(t + math.pi / 4), 0.22 * math.sin(t + math.pi / 4))
        cur = fr.p(h1 + 0.2, deck + 1.0 + 0.22 * math.cos(t), 0.22 * math.sin(t))
        bar(bm, cur, nxt, 0.018, m("BC_WoodDark"), sides=4)
    # a lantern on the wheelhouse's roof, a life ring on its side
    lp = fr.p(h1 + 0.1, deck + 2.12, 0.0)
    blob(bm, lp.x, lp.z, -lp.y, 0.09, 0.12, 0.09, m=m("BC_Lamp"), cuts=1)
    lr = fr.p((h0 + h1) / 2, deck + 1.1, hw + 0.05)
    for q in range(10):
        t0, t1 = 2 * math.pi * q / 10, 2 * math.pi * (q + 1) / 10
        p0 = fr.p((h0 + h1) / 2 + 0.2 * math.cos(t0), deck + 1.1 + 0.2 * math.sin(t0), hw + 0.06)
        p1 = fr.p((h0 + h1) / 2 + 0.2 * math.cos(t1), deck + 1.1 + 0.2 * math.sin(t1), hw + 0.06)
        bar(bm, p0, p1, 0.045, m("BC_Red") if q % 2 else m("BC_White"), sides=5)
    # the mast, its boom, the stays
    M = S["mast"]
    top = fr.p(M["a"], deck + 4.4, M["b"])
    bar(bm, fr.p(M["a"], deck, M["b"]), top, 0.07, m("BC_WoodDark"), sides=8, r_end=0.04)
    bar(bm, fr.p(M["a"], deck + 1.5, M["b"]), fr.p(M["a"] + 2.6, deck + 2.3, M["b"]), 0.04, m("BC_WoodDark"), sides=6)
    for a_end in (out[0][0] + 0.3, out[-1][0] - 0.3):
        bar(bm, top, fr.p(a_end, rail, 0.0), 0.012, m("BC_Rope"), sides=4)
    blob(bm, top.x, top.z + 0.08, -top.y, 0.06, 0.08, 0.06, m=m("BC_Lamp"), cuts=1)
    # a pennant
    bm.faces.new([bm.verts.new(fr.p(M["a"], deck + 4.3, 0.0)), bm.verts.new(fr.p(M["a"] - 0.6, deck + 4.15, 0.0)), bm.verts.new(fr.p(M["a"], deck + 4.0, 0.0))]).material_index = m("BC_Red")
    # the benches (their tops at the picnic bench's cushion), the bow seat, crates, a coil, nets
    seat = deck + 0.45
    for bch in S["benches"]:
        if bch["a"] < -4:
            obox(bm, fr, bch["a"] - 0.18, bch["a"] + 0.18, deck, seat, bch["b"] - 0.36, bch["b"] + 0.36, m("BC_Wood"))
        else:
            obox(bm, fr, bch["a"] - 0.4, bch["a"] + 0.4, seat - 0.05, seat, bch["b"] - 0.2, bch["b"] + 0.2, m("BC_Wood"))
            for da in (-0.3, 0.3):
                obox(bm, fr, bch["a"] + da - 0.03, bch["a"] + da + 0.03, deck, seat - 0.05, bch["b"] - 0.16, bch["b"] + 0.16, m("BC_WoodDark"))
    bs = S["bowSeat"]
    obox(bm, fr, bs["a"] - 0.22, bs["a"] + 0.22, deck, seat, bs["b"] - 0.3, bs["b"] + 0.3, m("BC_Wood"))
    for c in S["crates"]:
        obox(bm, fr, c["a"] - 0.3, c["a"] + 0.3, deck, deck + 0.42, c["b"] - 0.3, c["b"] + 0.3, m("BC_Wood"))
        obox(bm, fr, c["a"] - 0.32, c["a"] + 0.32, deck + 0.42, deck + 0.45, c["b"] - 0.32, c["b"] + 0.32, m("BC_WoodDark"))
    cp = fr.p(3.9, deck, -0.45)
    lathe(bm, cp.x, -cp.y, [(0.0, 0.0), (0.24, 0.0), (0.24, 0.09), (0.1, 0.09), (0.1, 0.0), (0.0, 0.0)], segs=12, m=m("BC_Rope"), y0=cp.z)
    # rod holders along both rails, a net over the stern, fenders
    for a_h in (-1.6, 0.6, 2.4):
        for side in (-1, 1):
            hb = half_at(a_h)
            bar(bm, fr.p(a_h, rail, side * (hb + 0.02)), fr.p(a_h, rail + 0.9, side * (hb + 0.5)), 0.016, m("BC_WoodDark"), sides=5)
    for a_f in (-3.4, -0.4, 2.2):
        p = fr.p(a_f, deck - 0.05, half_at(a_f) + 0.24)
        blob(bm, p.x, p.z, -p.y, 0.1, 0.2, 0.1, m=m("BC_Red"), cuts=2)
    # the anchor's chain off the bow
    bar(bm, fr.p(out[-1][0] - 0.1, rail, 0.0), fr.p(out[-1][0] + 0.5, -0.6, 0.0), 0.02, m("BC_Iron"), sides=5)
    # a string of bulbs from the masthead down to the bow, crab pots and a barrel on the stern deck,
    # a bucket and a net by the rail, a life ring on the wheelhouse
    string_of_lights(bm, fr.p(M["a"], deck + 3.9, 0.0), fr.p(out[-1][0] - 0.3, rail + 0.5, 0.0), rng, sag=0.5, every=0.5)
    for k_, b_ in enumerate((-0.45, 0.4)):
        obox(bm, fr, -5.25, -4.75, deck, deck + 0.34, b_ - 0.26, b_ + 0.26, m("BC_Rope") if k_ else m("BC_BambooDark"))
        obox(bm, fr, -5.2, -4.8, deck + 0.34, deck + 0.62, b_ - 0.22, b_ + 0.22, m("BC_BambooDark") if k_ else m("BC_Rope"))
    bp_ = fr.p(-2.3, deck, 1.05)
    lathe(bm, bp_.x, -bp_.y, [(0.0, 0.0), (0.2, 0.0), (0.24, 0.28), (0.2, 0.56), (0.0, 0.56)], segs=10, m=m("BC_Wood"), y0=bp_.z)
    kp_ = fr.p(1.9, deck, 1.0)
    lathe(bm, kp_.x, -kp_.y, [(0.0, 0.0), (0.12, 0.0), (0.15, 0.24), (0.13, 0.24), (0.1, 0.02), (0.0, 0.02)], segs=9, m=m("BC_Iron"), y0=kp_.z)
    hb_ = half_at(-0.6)
    oquad(bm, [fr.p(-1.2, rail + 0.02, -hb_ - 0.02), fr.p(0.0, rail + 0.02, -hb_ - 0.02), fr.p(0.1, deck + 0.1, -hb_ - 0.3), fr.p(-1.3, deck + 0.05, -hb_ - 0.28)], m("BC_Rope"))
    ring_ = fr.p(S["wheelhouse"]["a1"] + 0.03, deck + 1.0, -0.55)
    lathe(bm, ring_.x, -ring_.y, [(0.14, 0.0), (0.22, 0.0), (0.22, 0.07), (0.14, 0.07), (0.14, 0.0)], segs=10, m=m("BC_Red"), y0=ring_.z)
    # the fore deck's fish box (the catch on ice under glass), a net drum by the stern rail, cleats,
    # a radio whip and a horn on the wheelhouse's roof, tyres over the port side
    obox(bm, fr, 2.75, 3.45, deck, deck + 0.3, -0.25, 0.3, m("BC_Wood"))
    obox(bm, fr, 2.8, 3.4, deck + 0.3, deck + 0.33, -0.2, 0.25, m("BC_Glass"))
    for q_ in range(4):
        fp_ = fr.p(2.9 + 0.13 * q_, deck + 0.35, 0.0 + 0.06 * (q_ % 2))
        blob(bm, fp_.x, fp_.z, -fp_.y, 0.05, 0.03, 0.12, m=m("BC_White") if q_ % 2 else m("BC_Teal"), cuts=1)
    for b_ in (-0.35, 0.35):
        obox(bm, fr, -3.75, -3.65, deck, deck + 0.5, b_ - 0.03, b_ + 0.03, m("BC_Iron"))
    bar(bm, fr.p(-3.7, deck + 0.46, -0.38), fr.p(-3.7, deck + 0.46, 0.38), 0.17, m("BC_Rope"), sides=10)
    for a_c in (-2.4, 1.2, 4.0):
        for side_ in (-1, 1):
            cp_ = fr.p(a_c, rail + 0.06, side_ * (half_at(a_c) + 0.08))
            blob(bm, cp_.x, cp_.z, -cp_.y, 0.07, 0.03, 0.03, m=m("BC_Iron"), cuts=1)
    bar(bm, fr.p(h0 + 0.3, deck + 1.95, 0.4), fr.p(h0 + 0.2, deck + 3.3, 0.45), 0.012, m("BC_Iron"), sides=4, r_end=0.004)
    hp_ = fr.p(h1 - 0.2, deck + 2.02, -0.45)
    blob(bm, hp_.x, hp_.z, -hp_.y, 0.07, 0.07, 0.14, m=m("BC_Yellow"), cuts=1)
    for a_t in (-1.8, 1.0):
        tp_ = fr.p(a_t, deck - 0.18, -(half_at(a_t) + 0.22))
        lathe(bm, tp_.x, -tp_.y, [(0.1, -0.06), (0.2, -0.06), (0.2, 0.06), (0.1, 0.06), (0.1, -0.06)], segs=10, m=m("BC_Char"), y0=tp_.z)
    make_object("Sea_Boat", bm, MATS, coll)


def build_stacks(coll, rng):
    """A few rock stacks far off, the sea breaking white at their feet (none since the remake: the
    boat is alone on open water)."""
    if not (SEA.get("stacks") or SEA.get("buoys") or SEA.get("kelp")):
        return
    bm = bmesh.new()
    for i, (x, z, s) in enumerate(SEA["stacks"]):
        # (each its own shape: a tall spire, a broad block, a leaning tooth, in turn)
        tall = (1.8, 2.5, 1.4)[i % 3]
        wide = (1.1, 0.8, 1.35)[i % 3]
        blob(bm, x, 0.5 * tall * s, z, wide * s, tall * s, wide * 0.9 * s, m=m("BC_Rock"), cuts=3, noise=0.24, rng=rng, flat_bottom=-0.6)
        blob(bm, x - 0.5 * s, 0.3 * tall * s, z + 0.5 * s, wide * 0.7 * s, tall * 0.55 * s, wide * 0.7 * s, m=m("BC_RockDark"), cuts=3, noise=0.24, rng=rng, flat_bottom=-0.6)
        # a pale band where the birds sit, a tuft of grass, a gull or two at rest
        blob(bm, x, 1.42 * tall * s, z, wide * 0.5 * s, 0.12 * s, wide * 0.45 * s, m=m("BC_Stone"), cuts=1, noise=0.2, rng=rng)
        if i % 2 == 0:
            for q_ in range(rng.randint(1, 3)):
                ga = rng.random() * 6.283
                blob(bm, x + math.cos(ga) * 0.3 * s, 1.5 * tall * s + 0.06, z + math.sin(ga) * 0.3 * s, 0.07, 0.07, 0.12, m=m("BC_White"), cuts=1)
        # the lighthouse on the first and greatest of them: a white tower banded red, a lamp, a cap
        if i == 0:
            ty = 1.48 * tall * s
            lathe(bm, x, z, [(0.0, 0.0), (0.55, 0.0), (0.45, 1.3), (0.0, 1.3)], segs=10, m=m("BC_White"), y0=ty)
            lathe(bm, x, z, [(0.455, 1.3), (0.46, 1.3), (0.4, 2.0), (0.395, 2.0)], segs=10, m=m("BC_Red"), y0=ty)
            lathe(bm, x, z, [(0.0, 2.0), (0.4, 2.0), (0.34, 2.9), (0.0, 2.9)], segs=10, m=m("BC_White"), y0=ty)
            lathe(bm, x, z, [(0.0, 2.9), (0.46, 2.9), (0.46, 2.98), (0.0, 2.98)], segs=10, m=m("BC_Iron"), y0=ty)
            lathe(bm, x, z, [(0.0, 2.98), (0.24, 2.98), (0.24, 3.4), (0.0, 3.4)], segs=8, m=m("BC_Lamp"), y0=ty)
            lathe(bm, x, z, [(0.0, 3.4), (0.36, 3.4), (0.0, 3.85)], segs=10, m=m("BC_Red"), y0=ty)
        blob(bm, x + 0.9 * s, 0.4 * s, z + 0.4 * s, 0.7 * s, 0.9 * s, 0.65 * s, m=m("BC_RockDark"), cuts=3, noise=0.22, rng=rng, flat_bottom=-0.6)
        blob(bm, x - 0.2 * s, 2.5 * s, z - 0.1 * s, 0.5 * s, 0.3 * s, 0.45 * s, m=m("BC_RockMoss"), cuts=2, noise=0.15, rng=rng)
        # (low rocks awash at its foot)
        for q in range(4):
            t = 1.6 * q + 0.4
            blob(bm, x + math.cos(t) * 1.5 * s, 0.05, z + math.sin(t) * 1.4 * s, 0.4 * s, 0.25 * s, 0.35 * s, m=m("BC_RockDark"), cuts=2, noise=0.2, rng=rng, flat_bottom=-0.5)
    # two buoys riding the swell (a red cone on a float, a lamp at its head)
    for x, z in SEA.get("buoys", []):
        lathe(bm, x, z, [(0.0, -0.1), (0.3, -0.1), (0.34, 0.12), (0.2, 0.2), (0.0, 0.2)], segs=10, m=m("BC_White"), y0=0.0)
        lathe(bm, x, z, [(0.0, 0.2), (0.2, 0.2), (0.06, 0.95), (0.0, 0.95)], segs=8, m=m("BC_Red"), y0=0.0)
        blob(bm, x, 1.02, z, 0.06, 0.07, 0.06, m=m("BC_Lamp"), cuts=1)
    # kelp lying on the surface in patches
    for x, z, s in SEA.get("kelp", []):
        for q_ in range(7):
            ka, kr = rng.random() * 6.283, rng.uniform(0.0, 1.1) * s
            blob(bm, x + math.cos(ka) * kr, 0.03, z + math.sin(ka) * kr, rng.uniform(0.2, 0.45) * s, 0.02, rng.uniform(0.08, 0.16) * s, m=m("BC_Weed" if q_ % 2 else "BC_WeedDark"), cuts=1)
    make_object("Sea_Stacks", bm, MATS, coll)


def fuse_sea(coll):
    statics = []
    for ob in list(coll.all_objects):
        if ob.type != "MESH" or ob.name == "Sea_Water":
            continue
        bake_colors(ob)
        statics.append(ob)
    bpy.context.view_layer.update()
    target = statics[0]
    if len(statics) > 1:
        with bpy.context.temp_override(object=target, active_object=target, selected_objects=statics, selected_editable_objects=statics):
            bpy.ops.object.join()
    target.name = "Sea_Static"
    target.data.name = "Sea_StaticMesh"
    use_col(target.data)
    meshes = [o for o in coll.all_objects if o.type == "MESH"]
    return {"objects": len(meshes), "drawCalls": sum(len(o.data.materials) for o in meshes), "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)}


def build(root):
    purge()
    global SEA
    with open(os.path.join(root, "scripts", "blender", "data", "sea_scene.json"), encoding="utf-8") as f:
        SEA = json.load(f)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    rng = random.Random(77)
    build_water(coll)
    build_boat(coll, rng)
    build_stacks(coll, rng)
    return coll


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll = build(root)
        fused = fuse_sea(coll)
        out = os.path.join(root, "client", "public", "models", "sea.glb")
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
