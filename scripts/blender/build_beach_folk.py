"""Sunset Beach's folk: builds client/public/models/mango.glb (Mango the Toucan, the beach bar's
bartender), client/public/models/dune.glb (Dune, the old sea turtle who trades at the shack by the
pier) and client/public/models/brine.glb (Captain Brine the Walrus, who skippers the boat).

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    blender -b --factory-startup -P scripts/blender/build_beach_folk.py

Built the way the caverns' folk are (scripts/blender/build_cavern_folk.py, whose kit this file runs
up to its first character): every colour a vertex colour and each node ONE matte clay material, so
the game fuses a character into one skinned mesh, one draw call. Each stands at their own origin
facing +z; the game places and turns them (shared/worlds/beach.ts). The nodes entities/CampNpc.tsx
animates:

    Mango               the root (an empty at his feet)
      Mango_Body        a round black toucan, a white bib, a flowered shirt, blue-grey feet
        Mango_Head      his head and his great orange beak, a ring of blue round each eye, a
                        hibiscus behind one (pivots at the neck)
        Mango_ArmR      his right wing, a cocktail shaker in it (pivots at the shoulder)
        Mango_ArmL      his left wing
        Mango_Tail      a short square tail
    Dune                the root
      Dune_Body         an old sea turtle, a domed shell on his back, a cream belly, a canvas apron
        Dune_Head       his wrinkled head on a long neck, round spectacles, a straw hat
        Dune_ArmR       his right flipper (he waves with it)
        Dune_ArmL       his left flipper
        Dune_Tail       a stub of a tail under the shell
    Brine               the root
      Brine_Body        a great brown walrus in a navy pea coat, brass buttons, sea boots
        Brine_Head      his whiskered muzzle and two tusks, a white captain's cap, a pipe
        Brine_ArmR      his right flipper
        Brine_ArmL      his left flipper
        Brine_Tail      his hind flippers' tip

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import os
import traceback

import bpy


def _root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_beach_folk.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# the caverns' folk's kit (its shapes, its plumbing), run here up to its first character
_kit = open(os.path.join(_root(), "scripts", "blender", "build_cavern_folk.py"), encoding="utf-8").read()
exec(compile(_kit[: _kit.index("# Gus the Mole")], "build_cavern_folk.py", "exec"), globals())
repo_root = _root
_export_src = _kit[_kit.index("def export(coll, path):") : _kit.index("def main():")]
exec(compile(_export_src, "build_cavern_folk.py", "exec"), globals())

PALETTE.update(
    {
        "ToucanBlack": "#23232B", "ToucanWhite": "#F6F1E4", "Beak": "#F59A2C", "BeakTip": "#D94A2C", "BeakBase": "#F7D048", "EyeRing": "#4FB7E8", "ToucanFoot": "#6F8FA8",
        "ShirtTeal": "#2FA79B", "ShirtFlower": "#F4D35E", "Hibiscus": "#EF5D74", "Shaker": "#C9CED6",
        "TurtleSkin": "#7FA86B", "TurtleSkinDark": "#5E8A52", "Shell": "#6B5A3A", "ShellPlate": "#8A7448", "ShellRim": "#B49A62", "Plastron": "#E8D9A8", "Straw": "#E3C877", "StrawBand": "#C0503E", "Canvas": "#E9E1CF", "Brass": "#C9A24E",
        "Walrus": "#8A6248", "WalrusDark": "#6C4A36", "Muzzle": "#B08566", "Tusk": "#F4EEDC", "Coat": "#27405F", "CoatDark": "#1B2E46", "Cap": "#F6F3EA", "CapBand": "#1B2E46", "Pipe": "#5A3A22", "SeaBoot": "#2B2B2B",
        "Eye": PALETTE.get("Eye", "#1A1A1F"), "Glint": PALETTE.get("Glint", "#FFFFFF"), "Blush": PALETTE.get("Blush", "#F2A7A0"),
    }
)


def start(name):
    purge(name)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll, rig_root(name, coll)


def build_mango(root):
    coll, rig = start("Mango")
    B = Part()
    for sx in (-1, 1):
        cylinder(B, (sx * 0.11, 0.0, 0.03), (sx * 0.1, 0.2, 0.0), 0.035, "ToucanFoot", sides=6)
        blob(B, sx * 0.11, 0.03, 0.08, 0.07, 0.03, 0.1, "ToucanFoot", cuts=2, bottom=0.0)
    blob(B, 0.0, 0.55, 0.0, 0.33, 0.4, 0.3, "ToucanBlack", cuts=4)
    blob(B, 0.0, 0.66, 0.16, 0.22, 0.22, 0.16, "ToucanWhite", cuts=3)
    # a flowered shirt, open at the bib
    blob(B, 0.0, 0.45, 0.0, 0.345, 0.26, 0.315, "ShirtTeal", cuts=4, top=0.62, bottom=0.22)
    for x, y, z in ((0.2, 0.42, 0.24), (-0.22, 0.5, 0.2), (0.27, 0.52, 0.1), (-0.12, 0.34, 0.27), (0.05, 0.3, 0.29), (-0.29, 0.38, 0.06)):
        blob(B, x, y, z, 0.035, 0.035, 0.02, "ShirtFlower", cuts=1)
    body = node("Mango_Body", B, coll, rig)

    H = Part()
    neck = (0.0, 0.9, 0.02)
    blob(H, 0.0, 1.08, 0.02, 0.24, 0.23, 0.23, "ToucanBlack", cuts=4)
    blob(H, 0.0, 1.0, 0.15, 0.17, 0.13, 0.11, "ToucanWhite", cuts=3)
    # the great beak: a long curve of orange, yellow at its root, a red tip
    blob(H, 0.0, 1.08, 0.24, 0.1, 0.11, 0.06, "BeakBase", cuts=2)
    blob(H, 0.0, 1.07, 0.42, 0.085, 0.1, 0.24, "Beak", cuts=3, tilt=-0.18)
    blob(H, 0.0, 1.01, 0.62, 0.05, 0.06, 0.07, "BeakTip", cuts=2)
    blob(H, 0.0, 1.04, 0.42, 0.088, 0.012, 0.22, "ToucanBlack", cuts=1, tilt=-0.18)
    for sx in (-1, 1):
        blob(H, sx * 0.13, 1.14, 0.17, 0.055, 0.055, 0.02, "EyeRing", cuts=2)
    eyes(H, 0.13, 1.14, 0.185, 0.024, 0.028)
    for sx in (-1, 1):
        blob(H, sx * 0.17, 1.05, 0.14, 0.03, 0.018, 0.012, "Blush", cuts=1)
    # a hibiscus behind one ear
    for k in range(5):
        import math as _m
        a = 2 * _m.pi * k / 5
        blob(H, 0.19 + 0.045 * _m.cos(a), 1.24 + 0.045 * _m.sin(a), 0.06, 0.035, 0.035, 0.018, "Hibiscus", cuts=1)
    blob(H, 0.19, 1.24, 0.075, 0.018, 0.018, 0.016, "ShirtFlower", cuts=1)
    node("Mango_Head", H, coll, body, neck)

    A = Part()
    shoulder = (-0.3, 0.74, 0.02)
    hand = (-0.4, 0.62, 0.22)
    cylinder(A, shoulder, hand, 0.085, "ToucanBlack", r_end=0.07)
    blob(A, hand[0], hand[1], hand[2], 0.075, 0.06, 0.07, "ToucanBlack", cuts=2)
    # the cocktail shaker in his wing
    lathe(A, hand[0], hand[2] + 0.04, [(0, 0.0), (0.045, 0.0), (0.055, 0.14), (0.04, 0.2), (0.025, 0.24), (0, 0.245)], "Shaker", segs=10, y0=hand[1] + 0.03)
    node("Mango_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.3, 0.74, 0.02)
    hand = (0.38, 0.5, 0.12)
    cylinder(A, shoulder, hand, 0.085, "ToucanBlack", r_end=0.07)
    blob(A, hand[0], hand[1], hand[2], 0.075, 0.06, 0.07, "ToucanBlack", cuts=2)
    node("Mango_ArmL", A, coll, body, shoulder)

    T = Part()
    box(T, -0.09, 0.09, 0.3, 0.36, -0.5, -0.24, "ToucanBlack")
    node("Mango_Tail", T, coll, body, (0.0, 0.34, -0.26))
    return coll


def build_dune(root):
    coll, rig = start("Dune")
    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.17, 0.09, 0.05, 0.12, 0.09, 0.15, "TurtleSkinDark", cuts=2, bottom=0.0)
    # the shell on his back, its plates, its pale rim; the cream belly in front
    blob(B, 0.0, 0.58, -0.08, 0.4, 0.42, 0.3, "Shell", cuts=4)
    for x, y in ((0.0, 0.78), (-0.2, 0.62), (0.2, 0.62), (0.0, 0.46), (-0.18, 0.36), (0.18, 0.36)):
        blob(B, x, y, -0.33, 0.11, 0.1, 0.05, "ShellPlate", cuts=2)
    blob(B, 0.0, 0.56, -0.02, 0.42, 0.44, 0.1, "ShellRim", cuts=3)
    blob(B, 0.0, 0.55, 0.08, 0.34, 0.37, 0.22, "Plastron", cuts=4)
    # a canvas apron with a pocket, its strap
    blob(B, 0.0, 0.46, 0.14, 0.3, 0.26, 0.2, "Canvas", cuts=3, top=0.66, bottom=0.2)
    box(B, -0.1, 0.1, 0.36, 0.5, 0.325, 0.345, "Straw")
    body = node("Dune_Body", B, coll, rig)

    H = Part()
    neck = (0.0, 0.9, 0.08)
    cylinder(H, (0.0, 0.86, 0.08), (0.0, 1.06, 0.14), 0.11, "TurtleSkin", r_end=0.1)
    blob(H, 0.0, 1.16, 0.16, 0.2, 0.17, 0.22, "TurtleSkin", cuts=4)
    blob(H, 0.0, 1.11, 0.33, 0.11, 0.08, 0.08, "TurtleSkinDark", cuts=2)
    eyes(H, 0.1, 1.2, 0.3, 0.02, 0.022)
    # round brass spectacles
    for sx in (-1, 1):
        lathe(H, sx * 0.1, 0.345, [(0, 0.0), (0.05, 0.0), (0.05, 0.008), (0, 0.008)], "Brass", segs=12, y0=1.196)
    for sx in (-1, 1):
        blob(H, sx * 0.14, 1.11, 0.28, 0.03, 0.016, 0.012, "Blush", cuts=1)
    # a straw hat, a red band
    lathe(H, 0.0, 0.14, [(0, 0.0), (0.36, 0.0), (0.37, 0.015), (0.36, 0.03), (0, 0.03)], "Straw", segs=22, y0=1.29)
    lathe(H, 0.0, 0.14, [(0, 0.0), (0.2, 0.0), (0.19, 0.1), (0.14, 0.16), (0, 0.17)], "Straw", segs=18, y0=1.31)
    lathe(H, 0.0, 0.14, [(0, 0.0), (0.205, 0.0), (0.2, 0.05), (0, 0.05)], "StrawBand", segs=18, y0=1.315)
    node("Dune_Head", H, coll, body, neck)

    A = Part()
    shoulder = (-0.34, 0.7, 0.1)
    hand = (-0.5, 0.5, 0.26)
    cylinder(A, shoulder, hand, 0.08, "TurtleSkin", r_end=0.07)
    blob(A, hand[0], hand[1], hand[2], 0.1, 0.05, 0.12, "TurtleSkinDark", cuts=2)
    node("Dune_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.34, 0.7, 0.1)
    hand = (0.46, 0.48, 0.28)
    cylinder(A, shoulder, hand, 0.08, "TurtleSkin", r_end=0.07)
    blob(A, hand[0], hand[1], hand[2], 0.1, 0.05, 0.12, "TurtleSkinDark", cuts=2)
    node("Dune_ArmL", A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.2, -0.36, 0.05, 0.04, 0.09, "TurtleSkinDark", cuts=2)
    node("Dune_Tail", T, coll, body, (0.0, 0.2, -0.3))
    return coll


def build_brine(root):
    coll, rig = start("Brine")
    B = Part()
    for sx in (-1, 1):
        blob(B, sx * 0.18, 0.09, 0.06, 0.14, 0.09, 0.19, "SeaBoot", cuts=2, bottom=0.0)
    blob(B, 0.0, 0.62, 0.0, 0.46, 0.46, 0.4, "Walrus", cuts=4)
    # the pea coat, its collar, two rows of brass buttons
    blob(B, 0.0, 0.58, 0.0, 0.475, 0.4, 0.415, "Coat", cuts=4, top=0.92, bottom=0.2)
    blob(B, 0.0, 0.9, 0.12, 0.3, 0.07, 0.24, "CoatDark", cuts=2)
    for sx in (-1, 1):
        for y in (0.5, 0.66, 0.8):
            blob(B, sx * 0.1, y, 0.4, 0.025, 0.025, 0.012, "Brass", cuts=1)
    body = node("Brine_Body", B, coll, rig)

    H = Part()
    neck = (0.0, 1.0, 0.02)
    blob(H, 0.0, 1.22, 0.02, 0.32, 0.27, 0.3, "Walrus", cuts=4)
    # the whiskered muzzle, the nose, two tusks
    for sx in (-1, 1):
        blob(H, sx * 0.1, 1.12, 0.26, 0.13, 0.1, 0.1, "Muzzle", cuts=3)
        cylinder(H, (sx * 0.08, 1.05, 0.3), (sx * 0.1, 0.8, 0.34), 0.035, "Tusk", sides=8, r_end=0.012)
    blob(H, 0.0, 1.2, 0.33, 0.06, 0.04, 0.04, "WalrusDark", cuts=2)
    eyes(H, 0.14, 1.3, 0.25, 0.022, 0.026)
    for sx in (-1, 1):
        blob(H, sx * 0.14, 1.36, 0.25, 0.06, 0.02, 0.02, "Tusk", cuts=1)  # bushy white brows
    # a pipe at the corner of his mouth
    cylinder(H, (0.16, 1.1, 0.32), (0.3, 1.08, 0.42), 0.014, "Pipe", sides=6)
    lathe(H, 0.31, 0.43, [(0, 0.0), (0.035, 0.0), (0.04, 0.06), (0, 0.06)], "Pipe", segs=8, y0=1.07)
    # the captain's cap: a white crown, a dark band, a short peak, a brass badge
    lathe(H, 0.0, 0.02, [(0, 0.0), (0.27, 0.0), (0.27, 0.05), (0, 0.05)], "CapBand", segs=20, y0=1.42)
    lathe(H, 0.0, 0.02, [(0, 0.0), (0.28, 0.0), (0.33, 0.07), (0.3, 0.13), (0, 0.14)], "Cap", segs=20, y0=1.47)
    blob(H, 0.0, 1.43, 0.3, 0.2, 0.012, 0.1, "CapBand", cuts=2)
    blob(H, 0.0, 1.47, 0.29, 0.04, 0.04, 0.012, "Brass", cuts=1)
    node("Brine_Head", H, coll, body, neck)

    A = Part()
    shoulder = (-0.42, 0.82, 0.04)
    hand = (-0.56, 0.52, 0.2)
    cylinder(A, shoulder, hand, 0.11, "Coat", r_end=0.09)
    blob(A, hand[0], hand[1] - 0.03, hand[2], 0.1, 0.07, 0.13, "Walrus", cuts=2)
    node("Brine_ArmR", A, coll, body, shoulder)
    A = Part()
    shoulder = (0.42, 0.82, 0.04)
    hand = (0.54, 0.5, 0.2)
    cylinder(A, shoulder, hand, 0.11, "Coat", r_end=0.09)
    blob(A, hand[0], hand[1] - 0.03, hand[2], 0.1, 0.07, 0.13, "Walrus", cuts=2)
    node("Brine_ArmL", A, coll, body, shoulder)

    T = Part()
    blob(T, 0.0, 0.16, -0.42, 0.16, 0.05, 0.12, "WalrusDark", cuts=2)
    node("Brine_Tail", T, coll, body, (0.0, 0.2, -0.36))
    return coll


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        result = {"ok": True}
        colls = []
        for fn, file in ((build_mango, "mango.glb"), (build_dune, "dune.glb"), (build_brine, "brine.glb")):
            coll = fn(root)
            bpy.context.view_layer.update()
            out = os.path.join(root, "client", "public", "models", file)
            export(coll, out)
            result[file] = {"bytes": os.path.getsize(out), **summary(coll)}
            colls.append(coll)
        result["studio"] = studio(root, "finish", colls)
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
