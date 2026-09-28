"""Coach Bruno of the Velvet Ring: builds client/public/models/coach_bruno.glb.

Run it inside Blender like the casino's staff (through the Live Bridge, in a namespace of its own
with REPO_ROOT and REPORT_PATH set, or headless: blender -b -P scripts/blender/build_coach_bruno.py).
It borrows build_casino_staff.py's kit (everything above its first character): the same chibi
proportions, every colour a vertex colour in the one clay material, a draw call per node.

Bruno, the bouncer at the casino's gilded doors, coaches at the Velvet Ring by day: the same fawn
bulldog, out of his black suit and into a burgundy hoodie (the hall's colour, a cream drawstring, a
kangaroo pocket, the hood down behind his neck), grey sweatpants and trainers, a coach's brass
whistle on its cord, a towel over his shoulder, a blue mouthguard showing in his underbite, a
stopwatch in his left paw. He stands behind the pro shop's counter (on its duckboard: the game lifts
him onto it), facing +z, with the nodes entities/CampNpc.tsx animates:

    CoachBruno              the root (an empty at the feet)
      CoachBruno_Body       the body, the legs, the hoodie, the towel
        CoachBruno_Head     pivots at the neck: he looks at whoever comes near (and counts)
        CoachBruno_ArmR     pivots at the shoulder: he waves with it
        CoachBruno_ArmL     pivots at the shoulder: the stopwatch
        CoachBruno_Tail     pivots where it joins: a stub that wags

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
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
    if "__file__" in globals() and __file__.endswith("build_coach_bruno.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


_staff = open(os.path.join(_root(), "scripts", "blender", "build_casino_staff.py"), encoding="utf-8").read()
exec(compile(_staff[: _staff.index("def build_boris(L):")], "build_casino_staff.py", "exec"), globals())
REPO_ROOT = _root()

PALETTE.update(
    {
        "Hoodie": "#6E1A2A",
        "HoodieShade": "#561422",
        "Drawstring": "#EFE6D2",
        "Sweats": "#7C7F86",
        "SweatsShade": "#686B72",
        "Trainer": "#EDEBE6",
        "TrainerSole": "#2A2A2E",
        "Guard": "#3AA0E0",
        "Towel": "#F4EFE6",
        "TowelStripe": "#C8453A",
        "Whistle": "#D4A548",
        "Cord": "#C8453A",
        "Watch": "#C9C4BA",
        "WatchFace": "#F4F1EA",
    }
)


def build_coach():
    coll, root = rig("CoachBruno")
    B = Part()
    # sweatpants and trainers
    for sx in (-1, 1):
        cylinder(B, (sx * 0.12, 0.36, 0.0), (sx * 0.13, 0.1, 0.02), 0.095, "Sweats", r_end=0.085)
        blob(B, sx * 0.13, 0.1, 0.02, 0.09, 0.03, 0.09, "SweatsShade", cuts=1)  # the cuffs
        blob(B, sx * 0.13, 0.05, 0.07, 0.09, 0.05, 0.14, "Trainer", bottom=0.0)
        blob(B, sx * 0.13, 0.012, 0.07, 0.095, 0.014, 0.145, "TrainerSole", cuts=1)
    # the hoodie: the big body, its waistband, the kangaroo pocket, the hood behind the neck
    blob(B, 0.0, 0.57, 0.0, 0.31, 0.3, 0.26, "Hoodie", cuts=4)
    blob(B, 0.0, 0.36, 0.0, 0.29, 0.06, 0.245, "HoodieShade", cuts=2)
    blob(B, 0.0, 0.46, 0.225, 0.17, 0.08, 0.05, "HoodieShade", cuts=2)
    blob(B, 0.0, 0.84, -0.14, 0.22, 0.1, 0.12, "Hoodie", cuts=3)  # the hood, down
    blob(B, 0.0, 0.8, 0.1, 0.16, 0.06, 0.14, "FawnWhite")  # the chest ruff at the collar
    for sx in (-1, 1):
        cylinder(B, (sx * 0.06, 0.78, 0.2), (sx * 0.07, 0.6, 0.255), 0.009, "Drawstring", sides=5)
        blob(B, sx * 0.07, 0.59, 0.258, 0.014, 0.02, 0.012, "Drawstring", cuts=1)
    # the whistle on its cord
    for sx in (-1, 1):
        cylinder(B, (sx * 0.12, 0.8, 0.14), (0.0, 0.68, 0.26), 0.006, "Cord", sides=4)
    cylinder(B, (-0.03, 0.66, 0.275), (0.04, 0.66, 0.275), 0.02, "Whistle", sides=8)
    blob(B, 0.04, 0.655, 0.275, 0.025, 0.022, 0.022, "Whistle", cuts=1)
    # the towel over his right shoulder
    blob(B, -0.22, 0.83, 0.0, 0.1, 0.03, 0.26, "Towel", cuts=2)
    blob(B, -0.27, 0.66, 0.2, 0.08, 0.16, 0.025, "Towel", cuts=2)
    blob(B, -0.27, 0.53, 0.205, 0.081, 0.018, 0.026, "TowelStripe", cuts=1)
    body = node("CoachBruno_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.8, 0.0)
    blob(H, 0.0, 0.99, 0.0, 0.3, 0.19, 0.22, "Fawn", cuts=4, n=2.6)
    blob(H, 0.0, 0.92, 0.15, 0.22, 0.1, 0.1, "FawnWhite", n=2.6)
    for sx in (-1, 1):
        blob(H, sx * 0.14, 0.88, 0.15, 0.11, 0.09, 0.09, "FawnWhite")  # jowls
        blob(H, sx * 0.27, 1.1, -0.02, 0.06, 0.03, 0.07, "FawnDark", cuts=2, tilt=0.4)  # rose ears, folded
        blob(H, sx * 0.3, 1.06, 0.02, 0.03, 0.05, 0.05, "FawnDark", cuts=1)
    eyes(H, 0.085, 1.045, 0.2, 0.028, 0.032)
    for sx in (-1, 1):
        blob(H, sx * 0.09, 1.09, 0.2, 0.05, 0.012, 0.02, "FawnShade", cuts=1)  # a coach's frown lines
    blob(H, 0.0, 0.99, 0.255, 0.055, 0.036, 0.03, "Nose", cuts=2)
    blob(H, 0.0, 0.85, 0.2, 0.1, 0.035, 0.065, "Mouth")  # the underbite
    blob(H, 0.0, 0.868, 0.238, 0.075, 0.016, 0.022, "Guard", cuts=2)  # the mouthguard in it
    for k in range(3):
        blob(H, 0.0, 1.12 + k * 0.025, 0.17 - k * 0.025, 0.1 - k * 0.015, 0.008, 0.02, "FawnShade", cuts=1)  # his brow
    node("CoachBruno_Head", H, coll, body, neck)

    # the right arm hangs (he waves with it); the left holds his stopwatch up in front
    A = Part()
    shoulder = (-0.3, 0.72, 0.02)
    elbow = (-0.33, 0.5, 0.05)
    paw = (-0.32, 0.34, 0.1)
    arm(A, shoulder, elbow, paw, "Hoodie", "Hoodie", r=0.08, paw_size=0.062, paw_colour="Fawn")
    blob(A, -0.325, 0.4, 0.085, 0.062, 0.03, 0.062, "HoodieShade", cuts=1)  # the cuff
    node("CoachBruno_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.3, 0.72, 0.02)
    elbow = (0.32, 0.54, 0.2)
    paw = (0.18, 0.62, 0.3)
    arm(A, shoulder, elbow, paw, "Hoodie", "Hoodie", r=0.08, paw_size=0.062, paw_colour="Fawn")
    blob(A, 0.22, 0.6, 0.28, 0.06, 0.06, 0.03, "HoodieShade", cuts=1)
    cylinder(A, (0.17, 0.67, 0.34), (0.17, 0.67, 0.37), 0.045, "Watch", sides=14)
    cylinder(A, (0.17, 0.67, 0.37), (0.17, 0.67, 0.375), 0.037, "WatchFace", sides=14)
    cylinder(A, (0.17, 0.715, 0.355), (0.17, 0.735, 0.355), 0.01, "Watch", sides=6)
    node("CoachBruno_ArmL", A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.34, -0.27, 0.06, 0.05, 0.05, "Fawn")
    node("CoachBruno_Tail", T, coll, body, (0.0, 0.34, -0.23))
    return coll


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
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


def summary(coll):
    out = {}
    for o in coll.all_objects:
        if o.data is None:
            continue
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "y": [round(lo[2], 3), round(hi[2], 3)], "materials": len(o.data.materials)}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "drawCalls": sum(v["materials"] for v in out.values())}


def main_coach():
    report = globals().get("REPORT_PATH")
    try:
        root = _root()
        studio(root, "begin")
        coll = build_coach()
        bpy.context.view_layer.update()
        out = os.path.join(root, "client", "public", "models", "coach_bruno.glb")
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll)}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main_coach()
