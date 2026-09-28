"""The Velvet Ring's regulars: builds client/public/models/ring_regulars.glb.

Run it inside Blender like the casino's staff (through the Live Bridge, in a namespace of its own
with REPO_ROOT and REPORT_PATH set, or headless: blender -b -P scripts/blender/build_ring_regulars.py).
It borrows build_casino_staff.py's kit (everything above its first character): the same chibi
proportions, every colour a vertex colour in the one clay material, a draw call per node (the game
fuses each character into one skinned mesh: entities/CampNpc.tsx).

Three regulars who never miss a fight night:

    RingFan_Raccoon   seated on the bleachers (origin at his tier's foot, the plank BLEACHER_TOP
                      over it): a flat cap, a green varsity jacket, his paws on his knees (he claps)
    RingFan_Rabbit    seated beside him a tier up: a burgundy scarf with a gold stripe, a rosette
    BagBoxer          Kip the kangaroo, standing at the heavy bag in blue trunks and red gloves,
                      guard up (his punches are the game's: a rhythmic one-two on the bag)

Each one facing +z, with the nodes CampNpc animates: <Name>_Body, and on it _Head (pivot at the
neck), _ArmR / _ArmL (at the shoulders), _Tail. Coordinates: the game's (x, y up, z) is Blender's
(x, -z, y); the kit's `W` converts.
"""

import json
import math
import os
import traceback

import bpy


def _root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_ring_regulars.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


_staff = open(os.path.join(_root(), "scripts", "blender", "build_casino_staff.py"), encoding="utf-8").read()
exec(compile(_staff[: _staff.index("def build_boris(L):")], "build_casino_staff.py", "exec"), globals())
REPO_ROOT = _root()

# a bleacher plank's top over its tier (shared/seats.ts `bleacher`: y + h / 2)
BLEACHER_TOP = 0.45

PALETTE.update(
    {
        "RaccoonFur": "#8C8C94",
        "RaccoonDark": "#393940",
        "RaccoonLight": "#DCD9D3",
        "Cap": "#6E5B45",
        "CapShade": "#57483A",
        "Varsity": "#2F5E4A",
        "VarsityCream": "#EDE3CF",
        "Jeans": "#3E5578",
        "Sneaker": "#E9E5DD",
        "RabbitCream": "#F3E8D6",
        "RabbitShade": "#E2D2BA",
        "EarPinkR": "#E9A8A8",
        "Scarf": "#8E2433",
        "ScarfStripe": "#E6C66A",
        "Rosette": "#D8383A",
        "Cardigan": "#B98A5E",
        "RooFur": "#C98A52",
        "RooLight": "#EECDA2",
        "RooDark": "#8A5A32",
        "Trunks": "#2E4E9E",
        "TrunkStripe": "#F4F2EE",
        "RooGlove": "#C62A2A",
        "RooGloveDark": "#8E1A1C",
        "Lace": "#F2EEE6",
        "Tape": "#F0EDE6",
    }
)


def seated_legs(P, s, fur, trousers, shoe, r=0.055):
    """Thighs out along the plank from the hips, shins down to the tier's floor, the feet on it."""
    for sx in (-1, 1):
        cylinder(P, (sx * 0.09, s + 0.06, 0.0), (sx * 0.1, s + 0.05, 0.2), r, trousers, sides=10)
        blob(P, sx * 0.1, s + 0.05, 0.2, r, r, r, trousers, cuts=2)
        cylinder(P, (sx * 0.1, s + 0.03, 0.21), (sx * 0.1, 0.06, 0.24), r * 0.9, trousers, sides=10, r_end=r * 0.8)
        blob(P, sx * 0.1, 0.035, 0.29, 0.055, 0.035, 0.09, shoe, bottom=0.0)


def build_raccoon():
    coll, root = rig("RingFan_Raccoon")
    s = BLEACHER_TOP
    B = Part()
    seated_legs(B, s, "RaccoonFur", "Jeans", "Sneaker")
    blob(B, 0.0, s + 0.09, -0.02, 0.17, 0.1, 0.16, "Jeans", cuts=3)
    # the varsity jacket: a round body, cream sleeves' cuffs at the arms, a big V on the chest
    blob(B, 0.0, s + 0.3, -0.01, 0.18, 0.22, 0.15, "Varsity", cuts=4)
    blob(B, 0.0, s + 0.12, 0.0, 0.17, 0.035, 0.145, "VarsityCream", cuts=2)  # the ribbed hem
    for sx in (-1, 1):
        cylinder(B, (sx * 0.02, s + 0.4, 0.14), (sx * 0.055, s + 0.3, 0.15), 0.012, "VarsityCream", sides=5)
    blob(B, 0.0, s + 0.47, 0.06, 0.11, 0.04, 0.09, "RaccoonLight")  # the ruff at the collar
    body = node("RingFan_Raccoon_Body", B, coll, root)

    H = Part()
    neck = (0.0, s + 0.48, 0.0)
    hy = s + 0.63
    blob(H, 0.0, hy, 0.01, 0.18, 0.15, 0.16, "RaccoonFur", cuts=4)
    blob(H, 0.0, hy - 0.04, 0.12, 0.1, 0.06, 0.07, "RaccoonLight")  # the muzzle
    blob(H, 0.0, hy + 0.015, 0.125, 0.15, 0.045, 0.05, "RaccoonDark", cuts=2)  # the bandit mask
    blob(H, 0.0, hy - 0.02, 0.19, 0.026, 0.02, 0.016, "Nose", cuts=1)
    eyes(H, 0.065, hy + 0.02, 0.155, 0.026, 0.03)
    for sx in (-1, 1):
        blob(H, sx * 0.11, hy + 0.12, -0.02, 0.05, 0.05, 0.03, "RaccoonFur", cuts=2)
        blob(H, sx * 0.11, hy + 0.12, 0.0, 0.03, 0.035, 0.01, "RaccoonLight", cuts=1)
    # the flat cap: a round crown pulled forward, its short peak
    blob(H, 0.0, hy + 0.12, -0.01, 0.17, 0.055, 0.16, "Cap", cuts=3, tilt=0.15)
    blob(H, 0.0, hy + 0.1, 0.15, 0.13, 0.015, 0.07, "CapShade", cuts=2)
    node("RingFan_Raccoon_Head", H, coll, body, neck)

    # both paws resting on the knees: he claps with them
    for sx, name in ((-1, "RingFan_Raccoon_ArmR"), (1, "RingFan_Raccoon_ArmL")):
        A = Part()
        shoulder = (sx * 0.16, s + 0.38, 0.0)
        arm(A, shoulder, (sx * 0.19, s + 0.24, 0.07), (sx * 0.12, s + 0.12, 0.2), "Varsity", "RaccoonFur", r=0.045, paw_size=0.042, paw_colour="RaccoonDark")
        blob(A, sx * 0.175, s + 0.2, 0.1, 0.045, 0.02, 0.045, "VarsityCream", cuts=1)
        node(name, A, coll, body, shoulder)

    # the ringed tail, off the plank behind him
    T = Part()
    pts = [(0.0, s + 0.05, -0.16), (0.05, s - 0.02, -0.3), (0.12, s - 0.06, -0.42)]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        cylinder(T, a, b, 0.055, "RaccoonFur" if k % 2 == 0 else "RaccoonDark", sides=10, r_end=0.06)
    blob(T, pts[-1][0], pts[-1][1], pts[-1][2], 0.06, 0.06, 0.07, "RaccoonDark", cuts=2)
    node("RingFan_Raccoon_Tail", T, coll, body, pts[0])
    return coll


def build_rabbit():
    coll, root = rig("RingFan_Rabbit")
    s = BLEACHER_TOP
    B = Part()
    seated_legs(B, s, "RabbitCream", "Cardigan", "RabbitShade", r=0.05)
    blob(B, 0.0, s + 0.09, -0.02, 0.16, 0.1, 0.16, "RabbitCream", cuts=3)
    blob(B, 0.0, s + 0.28, -0.01, 0.16, 0.2, 0.14, "Cardigan", cuts=4)  # a cosy cardigan
    blob(B, 0.0, s + 0.3, 0.1, 0.08, 0.16, 0.05, "RabbitCream")  # the chest under it
    # the scarf, round the neck and a tail of it down the front, gold stripes
    lathe(B, 0.0, 0.0, [(0, s + 0.4), (0.13, s + 0.4), (0.14, s + 0.45), (0.12, s + 0.49), (0, s + 0.49)], "Scarf", segs=16)
    blob(B, 0.06, s + 0.31, 0.13, 0.045, 0.1, 0.02, "Scarf", cuts=2)
    for k in range(2):
        blob(B, 0.06, s + 0.25 + k * 0.07, 0.15, 0.047, 0.012, 0.018, "ScarfStripe", cuts=1)
    blob(B, -0.08, s + 0.35, 0.14, 0.035, 0.035, 0.012, "Rosette", cuts=2)  # a red rosette for the Red Corner
    blob(B, -0.08, s + 0.35, 0.152, 0.015, 0.015, 0.006, "ScarfStripe", cuts=1)
    body = node("RingFan_Rabbit_Body", B, coll, root)

    H = Part()
    neck = (0.0, s + 0.49, 0.0)
    hy = s + 0.63
    blob(H, 0.0, hy, 0.01, 0.17, 0.15, 0.15, "RabbitCream", cuts=4)
    blob(H, 0.0, hy - 0.05, 0.11, 0.08, 0.055, 0.06, "RabbitShade")
    blob(H, 0.0, hy - 0.02, 0.165, 0.022, 0.016, 0.014, "EarPinkR", cuts=1)
    eyes(H, 0.065, hy + 0.02, 0.13, 0.026, 0.032)
    for sx in (-1, 1):
        blob(H, sx * 0.1, hy - 0.04, 0.13, 0.03, 0.018, 0.01, "Blush", cuts=1)
        # the long ears, one flopped over
        tip = (sx * 0.14, hy + 0.36, -0.05) if sx < 0 else (0.22, hy + 0.22, -0.06)
        cylinder(H, (sx * 0.06, hy + 0.12, -0.02), tip, 0.045, "RabbitCream", sides=8, r_end=0.035)
        cylinder(H, (sx * 0.06, hy + 0.13, 0.0), (tip[0] * 0.95, tip[1] - 0.02, tip[2] + 0.02), 0.022, "EarPinkR", sides=6, r_end=0.018)
    node("RingFan_Rabbit_Head", H, coll, body, neck)

    for sx, name in ((-1, "RingFan_Rabbit_ArmR"), (1, "RingFan_Rabbit_ArmL")):
        A = Part()
        shoulder = (sx * 0.15, s + 0.37, 0.0)
        arm(A, shoulder, (sx * 0.18, s + 0.23, 0.07), (sx * 0.11, s + 0.12, 0.19), "Cardigan", "RabbitCream", r=0.042, paw_size=0.04, paw_colour="RabbitCream")
        node(name, A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, s + 0.08, -0.19, 0.06, 0.06, 0.05, "RabbitCream", cuts=2, fluff=0.1)
    node("RingFan_Rabbit_Tail", T, coll, body, (0.0, s + 0.08, -0.15))
    return coll


def build_kangaroo():
    coll, root = rig("BagBoxer")
    B = Part()
    # big hind feet and haunches, the blue trunks with a white waistband stripe
    for sx in (-1, 1):
        blob(B, sx * 0.11, 0.035, 0.1, 0.06, 0.035, 0.17, "RooDark", bottom=0.0)
        cylinder(B, (sx * 0.11, 0.32, -0.02), (sx * 0.11, 0.06, 0.04), 0.07, "RooFur", r_end=0.05)
        blob(B, sx * 0.12, 0.3, 0.0, 0.1, 0.12, 0.11, "RooFur", cuts=3)
    blob(B, 0.0, 0.4, -0.01, 0.19, 0.1, 0.16, "Trunks", cuts=3)
    lathe(B, 0.0, -0.01, [(0, 0.47), (0.19, 0.47), (0.19, 0.5), (0, 0.5)], "TrunkStripe", segs=16)
    for sx in (-1, 1):
        blob(B, sx * 0.13, 0.33, 0.01, 0.1, 0.07, 0.12, "Trunks", cuts=2)  # the trunks' legs
    # the upright body: fur, a pale chest and belly
    blob(B, 0.0, 0.66, -0.01, 0.17, 0.2, 0.14, "RooFur", cuts=4)
    blob(B, 0.0, 0.62, 0.09, 0.1, 0.18, 0.06, "RooLight")
    body = node("BagBoxer_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.84, 0.0)
    blob(H, 0.0, 0.98, 0.0, 0.14, 0.14, 0.15, "RooFur", cuts=4)
    blob(H, 0.0, 0.93, 0.15, 0.08, 0.06, 0.1, "RooLight")  # the long muzzle
    blob(H, 0.0, 0.95, 0.24, 0.028, 0.022, 0.018, "Nose", cuts=1)
    eyes(H, 0.06, 1.01, 0.12, 0.024, 0.03)
    blob(H, 0.0, 1.07, 0.11, 0.1, 0.012, 0.02, "RooDark", cuts=1)  # a determined brow
    for sx in (-1, 1):
        cylinder(H, (sx * 0.07, 1.08, -0.03), (sx * 0.12, 1.3, -0.07), 0.05, "RooFur", sides=6, r_end=0.02)
        cylinder(H, (sx * 0.075, 1.09, -0.01), (sx * 0.115, 1.26, -0.05), 0.025, "EarPinkR", sides=5, r_end=0.01)
    # a white headband, taped
    lathe(H, 0.0, 0.0, [(0, 1.04), (0.145, 1.04), (0.148, 1.07), (0, 1.07)], "Tape", segs=16)
    node("BagBoxer_Head", H, coll, body, neck)

    # arms in the guard: the gloves up before the chest (he punches from here)
    for sx, name in ((-1, "BagBoxer_ArmR"), (1, "BagBoxer_ArmL")):
        A = Part()
        shoulder = (sx * 0.16, 0.76, 0.0)
        elbow = (sx * 0.19, 0.6, 0.08)
        paw = (sx * 0.1, 0.74, 0.2)
        cylinder(A, shoulder, elbow, 0.04, "RooFur", r_end=0.037)
        blob(A, elbow[0], elbow[1], elbow[2], 0.038, 0.038, 0.038, "RooFur", cuts=1)
        cylinder(A, elbow, paw, 0.034, "Tape", r_end=0.034)  # taped wrists
        blob(A, paw[0], paw[1], paw[2] + 0.02, 0.075, 0.085, 0.08, "RooGlove", cuts=3)
        blob(A, paw[0] - sx * 0.05, paw[1] + 0.01, paw[2] + 0.03, 0.03, 0.045, 0.035, "RooGlove", cuts=2)  # the thumb
        lathe(A, paw[0], paw[2] + 0.02, [(0, -0.07), (0.06, -0.07), (0.062, -0.04), (0, -0.04)], "RooGloveDark", segs=12, y0=paw[1])
        node(name, A, coll, body, shoulder)

    # the great tail, down behind him to the floor
    T = Part()
    pts = [(0.0, 0.36, -0.14), (0.0, 0.18, -0.34), (0.0, 0.05, -0.55)]
    for a, b in zip(pts, pts[1:]):
        cylinder(T, a, b, 0.07, "RooFur", sides=10, r_end=0.05)
    blob(T, 0.0, 0.04, -0.58, 0.045, 0.04, 0.06, "RooDark", cuts=1)
    node("BagBoxer_Tail", T, coll, body, pts[0])
    return coll


def export_all(colls, path):
    layer = bpy.context.view_layer
    layer.update()
    names = set()
    for c in colls:
        names |= {o.name for o in c.all_objects}
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in names)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False, export_extras=False, export_vertex_color="ACTIVE")
    while True:
        try:
            bpy.ops.export_scene.gltf(**kwargs)
            return
        except TypeError as err:
            bad = next((k for k in list(kwargs) if k in str(err) and k not in ("filepath", "export_format", "export_apply", "export_yup")), None)
            if not bad:
                raise
            kwargs.pop(bad)


def summary(colls):
    out = {}
    for c in colls:
        for o in c.all_objects:
            if o.data is None:
                continue
            ws = [o.matrix_world @ v.co for v in o.data.vertices]
            lo = [min(w[k] for w in ws) for k in range(3)]
            hi = [max(w[k] for w in ws) for k in range(3)]
            out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "y": [round(lo[2], 3), round(hi[2], 3)], "materials": len(o.data.materials)}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main_regulars():
    report = globals().get("REPORT_PATH")
    try:
        root = _root()
        studio(root, "begin")
        colls = [build_raccoon(), build_rabbit(), build_kangaroo()]
        bpy.context.view_layer.update()
        out = os.path.join(root, "client", "public", "models", "ring_regulars.glb")
        export_all(colls, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(colls)}
        result["studio"] = studio(root, "finish", colls)
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main_regulars()
