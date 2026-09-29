"""The Velvet Ring's regulars: builds client/public/models/ring_regulars.glb.

Run it inside Blender like the casino's staff (through the Live Bridge, in a namespace of its own
with REPO_ROOT and REPORT_PATH set, or headless: blender -b -P scripts/blender/build_ring_regulars.py).
It borrows build_casino_staff.py's kit (everything above its first character): the same chibi
proportions, every colour a vertex colour in the one clay material, a draw call per node (the game
fuses each character into one skinned mesh: entities/CampNpc.tsx).

The regulars who never miss a fight night:

    RingFan_Raccoon   seated on the bleachers (origin at his tier's foot, the plank BLEACHER_TOP
                      over it): a flat cap, a green varsity jacket, his paws on his knees (he claps)
    RingFan_Rabbit    seated beside him a tier up: a burgundy scarf with a gold stripe, a rosette
    BagBoxer          Kip the kangaroo, standing at the heavy bag in blue trunks and red gloves,
                      guard up (his punches are the game's: a rhythmic one-two on the bag)
    RingCrowd         the fight-night crowd: five more fans in one node (a fox in a red hoodie, a
                      panda in a tweed cap, a ginger cat in a bobble beanie, an otter waving a blue
                      foam finger, a bulldog in a bomber jacket), RingCrowd_<n>_Body / _Head /
                      _ArmR / _ArmL each; built side by side, seated like the others (the game sets
                      each on its own spot of the bleachers and fuses all five into one skinned mesh)
    Referee           Ref Barnaby, the ring's referee: an old basset hound in the black-and-white
                      striped shirt, a black bow tie, black trousers and shoes, arms at his sides
    Trainee           a young pug skipping rope before the gym's mirrors: a grey tank top, navy
                      shorts, a red sweatband; the rope in its own part, Trainee_Rope, its origin
                      on the line through both hands (the game turns it round that line)

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
        # the crowd
        "FoxFur": "#D9772F",
        "FoxLight": "#F6E9D6",
        "FoxDark": "#3A2A22",
        "Hoodie": "#B8412F",
        "HoodieDark": "#8E2F22",
        "PandaWhite": "#F2EFEA",
        "PandaBlack": "#26252A",
        "Tweed": "#8A7A60",
        "TweedDark": "#6B5E4A",
        "Knit": "#6E8B5A",
        "GingerFur": "#E0913F",
        "GingerLight": "#F7E3C6",
        "GingerStripe": "#B8662A",
        "Beanie": "#2E3F66",
        "Pom": "#F2EEE6",
        "HoodieGrey": "#8E949C",
        "OtterFur": "#7A5234",
        "OtterLight": "#D8BE98",
        "Stripe": "#3A6FB0",
        "StripeWhite": "#F4F2EE",
        "FoamBlue": "#2F6FD8",
        "DogFawn": "#C9A27A",
        "DogLight": "#EFE0C8",
        "DogDark": "#4A3528",
        "Bomber": "#2A2D32",
        "BomberRib": "#B8412F",
        "Bandana": "#C8322B",
        "Khaki": "#A08A60",
        # Ref Barnaby
        "HoundTan": "#B87A45",
        "HoundDark": "#6B4226",
        "HoundWhite": "#F2E8D8",
        "RefWhite": "#F4F2EE",
        "RefBlack": "#1F1D22",
        "Trousers": "#23222A",
        "Shoe": "#141317",
        # the trainee
        "PugFawn": "#D9B98C",
        "PugMask": "#2A2420",
        "TankGrey": "#9AA0A6",
        "Shorts": "#26365E",
        "ShortStripe": "#F2EEE6",
        "Sweatband": "#D8383A",
        "RopeRed": "#C8322B",
        "Handle": "#A0703F",
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


# ---------------------------------------------------------------------------------------------
# the fight-night crowd: five seated fans in one node


def crowd_fan(coll, root, n, ox, fur, light, dark, top, top_dark, trousers, shoe, ears, extra):
    """A seated fan built at x = `ox` (their origin at their tier's foot there; the game moves each
    one to its own spot): RingCrowd_<n>_Body, and on it _Head, _ArmR, _ArmL."""
    s = BLEACHER_TOP
    name = f"RingCrowd_{n}"
    B = Part()
    for sx in (-1, 1):
        cylinder(B, (ox + sx * 0.09, s + 0.06, 0.0), (ox + sx * 0.1, s + 0.05, 0.2), 0.055, trousers, sides=10)
        blob(B, ox + sx * 0.1, s + 0.05, 0.2, 0.055, 0.055, 0.055, trousers, cuts=2)
        cylinder(B, (ox + sx * 0.1, s + 0.03, 0.21), (ox + sx * 0.1, 0.06, 0.24), 0.05, trousers, sides=10, r_end=0.044)
        blob(B, ox + sx * 0.1, 0.035, 0.29, 0.055, 0.035, 0.09, shoe, bottom=0.0)
    blob(B, ox, s + 0.09, -0.02, 0.17, 0.1, 0.16, trousers, cuts=3)
    blob(B, ox, s + 0.29, -0.01, 0.175, 0.21, 0.15, top, cuts=4)
    blob(B, ox, s + 0.12, 0.0, 0.165, 0.035, 0.14, top_dark, cuts=2)  # the hem
    blob(B, ox, s + 0.46, 0.05, 0.1, 0.035, 0.08, light)  # the chest's fur at the collar
    if extra == "scarf":
        lathe(B, ox, 0.0, [(0, s + 0.41), (0.14, s + 0.41), (0.15, s + 0.46), (0.13, s + 0.5), (0, s + 0.5)], "Knit", segs=16)
        blob(B, ox - 0.07, s + 0.33, 0.13, 0.045, 0.1, 0.02, "Knit", cuts=2)
    if extra == "bomber":
        lathe(B, ox, 0.0, [(0, s + 0.42), (0.14, s + 0.42), (0.15, s + 0.47), (0, s + 0.47)], "BomberRib", segs=16)
        blob(B, ox, s + 0.3, 0.14, 0.012, 0.16, 0.012, "BomberRib", cuts=1)  # the zip
    if extra == "stripes":
        for k in range(3):
            lathe(B, ox, -0.01, [(0, s + 0.2 + k * 0.1), (0.172, s + 0.2 + k * 0.1), (0.172, s + 0.235 + k * 0.1), (0, s + 0.235 + k * 0.1)], "StripeWhite", segs=16)
    body = node(f"{name}_Body", B, coll, root, (ox, 0.0, 0.0))

    H = Part()
    neck = (ox, s + 0.48, 0.0)
    hy = s + 0.63
    blob(H, ox, hy, 0.01, 0.175, 0.15, 0.16, fur, cuts=4)
    blob(H, ox, hy - 0.045, 0.11, 0.09, 0.06, 0.07, light)  # the muzzle
    blob(H, ox, hy - 0.02, 0.18, 0.026, 0.02, 0.016, "Nose", cuts=1)
    # (the kit's eyes() mirrors about x = 0: built about the fan's own x by hand)
    for sx in (-1, 1):
        blob(H, ox + sx * 0.065, hy + 0.02, 0.145, 0.026, 0.03, 0.02, "Eye", cuts=2)
        blob(H, ox + sx * 0.065 - 0.008, hy + 0.03, 0.163, 0.008, 0.008, 0.005, "Glint", cuts=1)
        blob(H, ox + sx * 0.1, hy - 0.045, 0.125, 0.028, 0.017, 0.01, "Blush", cuts=1)
    if ears == "pointy":
        for sx in (-1, 1):
            cylinder(H, (ox + sx * 0.1, hy + 0.1, -0.01), (ox + sx * 0.15, hy + 0.26, -0.03), 0.06, fur, sides=4, r_end=0.008)
            cylinder(H, (ox + sx * 0.1, hy + 0.11, 0.015), (ox + sx * 0.14, hy + 0.22, 0.0), 0.028, dark, sides=4, r_end=0.006)
        blob(H, ox, hy - 0.06, 0.15, 0.06, 0.035, 0.05, light)
    elif ears == "round":
        for sx in (-1, 1):
            blob(H, ox + sx * 0.13, hy + 0.12, -0.01, 0.055, 0.055, 0.03, dark, cuts=2)
            blob(H, ox + sx * 0.07, hy + 0.03, 0.13, 0.04, 0.05, 0.02, dark, cuts=2)  # the panda's eye patches
    elif ears == "cat":
        for sx in (-1, 1):
            cylinder(H, (ox + sx * 0.1, hy + 0.1, -0.01), (ox + sx * 0.13, hy + 0.22, -0.02), 0.055, fur, sides=4, r_end=0.008)
        for k in (-1, 0, 1):
            blob(H, ox + k * 0.05, hy + 0.12, 0.06, 0.015, 0.04, 0.02, "GingerStripe", cuts=1)
    elif ears == "small":
        for sx in (-1, 1):
            blob(H, ox + sx * 0.14, hy + 0.08, -0.02, 0.035, 0.035, 0.02, dark, cuts=2)
    elif ears == "floppy":
        for sx in (-1, 1):
            cylinder(H, (ox + sx * 0.13, hy + 0.08, -0.01), (ox + sx * 0.18, hy - 0.02, 0.02), 0.045, dark, sides=6, r_end=0.03)
        blob(H, ox, hy - 0.07, 0.12, 0.11, 0.045, 0.06, light)  # the jowls
    # hats
    if extra == "tweed":
        blob(H, ox, hy + 0.12, -0.01, 0.17, 0.055, 0.16, "Tweed", cuts=3, tilt=0.15)
        blob(H, ox, hy + 0.1, 0.15, 0.13, 0.015, 0.07, "TweedDark", cuts=2)
    if extra == "beanie":
        blob(H, ox, hy + 0.1, -0.01, 0.18, 0.1, 0.17, "Beanie", cuts=3, bottom=0.0)
        lathe(H, ox, -0.01, [(0, hy + 0.06), (0.18, hy + 0.06), (0.185, hy + 0.1), (0, hy + 0.1)], "Pom", segs=16)
        blob(H, ox, hy + 0.21, -0.01, 0.045, 0.045, 0.045, "Pom", cuts=2, fluff=0.15)
    if extra == "bomber":
        lathe(H, ox, 0.0, [(0, hy - 0.12), (0.17, hy - 0.12), (0.17, hy - 0.08), (0, hy - 0.08)], "Bandana", segs=14)
    node(f"{name}_Head", H, coll, body, neck)

    for sx, arm_name in ((-1, f"{name}_ArmR"), (1, f"{name}_ArmL")):
        A = Part()
        shoulder = (ox + sx * 0.16, s + 0.38, 0.0)
        arm(A, shoulder, (ox + sx * 0.19, s + 0.24, 0.07), (ox + sx * 0.12, s + 0.12, 0.2), top, fur, r=0.045, paw_size=0.042, paw_colour=fur)
        if extra == "stripes" and sx == -1:
            # the blue foam finger on the right paw
            blob(A, ox + sx * 0.12, s + 0.14, 0.24, 0.07, 0.06, 0.07, "FoamBlue", cuts=2)
            cylinder(A, (ox + sx * 0.12, s + 0.18, 0.26), (ox + sx * 0.12, s + 0.34, 0.3), 0.03, "FoamBlue", sides=6, r_end=0.024)
        node(arm_name, A, coll, body, shoulder)
    return body


def build_crowd():
    coll, root = rig("RingCrowd")
    fans = [
        ("FoxFur", "FoxLight", "FoxDark", "Hoodie", "HoodieDark", "Jeans", "Sneaker", "pointy", "scarf"),
        ("PandaWhite", "PandaWhite", "PandaBlack", "Cardigan", "TweedDark", "Khaki", "PandaBlack", "round", "tweed"),
        ("GingerFur", "GingerLight", "GingerStripe", "HoodieGrey", "Beanie", "Jeans", "Sneaker", "cat", "beanie"),
        ("OtterFur", "OtterLight", "OtterFur", "Stripe", "Stripe", "Khaki", "Sneaker", "small", "stripes"),
        ("DogFawn", "DogLight", "DogDark", "Bomber", "BomberRib", "Jeans", "Sneaker", "floppy", "bomber"),
    ]
    for i, f in enumerate(fans):
        crowd_fan(coll, root, i + 1, (i - 2) * 0.9, *f)
    return coll


# ---------------------------------------------------------------------------------------------
# Ref Barnaby


def build_referee():
    coll, root = rig("Referee")
    B = Part()
    # black trousers to black shoes
    for sx in (-1, 1):
        cylinder(B, (sx * 0.09, 0.44, 0.0), (sx * 0.1, 0.07, 0.01), 0.06, "Trousers", sides=10, r_end=0.052)
        blob(B, sx * 0.1, 0.035, 0.05, 0.06, 0.035, 0.1, "Shoe", bottom=0.0)
    blob(B, 0.0, 0.46, -0.01, 0.17, 0.08, 0.14, "Trousers", cuts=3)
    blob(B, 0.0, 0.47, 0.0, 0.172, 0.02, 0.142, "RefBlack", cuts=1)  # the belt
    # the striped shirt: white, with black stripes down it (each following the round body)
    cy, hx, hy, hz = 0.64, 0.18, 0.2, 0.15
    blob(B, 0.0, cy, -0.01, hx, hy, hz, "RefWhite", cuts=4)
    # (each stripe a thin slice of the same rounded body, a little proud of it, front and back)
    for k in (-3, -2, -1, 0, 1, 2, 3):
        x = k * 0.05
        f = max(0.25, 1 - abs(x / hx) ** 2.2) ** (1 / 2.2)
        blob(B, x, cy, -0.01, 0.017, hy * f + 0.01, hz * f + 0.012, "RefBlack", cuts=3)
    # the collar and the bow tie
    lathe(B, 0.0, 0.0, [(0, 0.8), (0.12, 0.8), (0.125, 0.83), (0, 0.83)], "RefWhite", segs=16)
    for sx in (-1, 1):
        blob(B, sx * 0.045, 0.815, 0.12, 0.04, 0.026, 0.02, "RefBlack", cuts=2)
    blob(B, 0.0, 0.815, 0.13, 0.016, 0.018, 0.014, "RefBlack", cuts=1)
    body = node("Referee_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.83, 0.0)
    hy = 0.99
    blob(H, 0.0, hy, 0.0, 0.16, 0.15, 0.16, "HoundTan", cuts=4)
    blob(H, 0.0, hy + 0.02, 0.12, 0.05, 0.12, 0.05, "HoundWhite", cuts=2)  # the white blaze
    blob(H, 0.0, hy - 0.06, 0.14, 0.1, 0.07, 0.08, "HoundWhite")  # the long muzzle
    blob(H, 0.0, hy - 0.11, 0.12, 0.09, 0.04, 0.06, "HoundWhite", cuts=2)  # the jowls
    blob(H, 0.0, hy - 0.03, 0.22, 0.034, 0.026, 0.022, "Nose", cuts=1)
    # droopy, kindly eyes under a heavy brow
    for sx in (-1, 1):
        blob(H, sx * 0.062, hy + 0.025, 0.14, 0.024, 0.02, 0.012, "Eye", cuts=1)
        blob(H, sx * 0.062, hy + 0.047, 0.145, 0.034, 0.012, 0.012, "HoundTan", cuts=1)  # the lid
        blob(H, sx * 0.07, hy + 0.075, 0.13, 0.03, 0.01, 0.012, "HoundDark", cuts=1)  # the brow
    # the long ears, hanging down past the jaw
    for sx in (-1, 1):
        cylinder(H, (sx * 0.14, hy + 0.06, -0.01), (sx * 0.18, hy - 0.2, 0.02), 0.055, "HoundDark", sides=8, r_end=0.05)
        blob(H, sx * 0.18, hy - 0.2, 0.02, 0.05, 0.04, 0.05, "HoundDark", cuts=2)
    node("Referee_Head", H, coll, body, neck)

    for sx, name in ((-1, "Referee_ArmR"), (1, "Referee_ArmL")):
        A = Part()
        shoulder = (sx * 0.17, 0.76, 0.0)
        elbow = (sx * 0.21, 0.6, 0.0)
        paw = (sx * 0.2, 0.46, 0.03)
        cylinder(A, shoulder, elbow, 0.048, "RefWhite", r_end=0.045)
        blob(A, elbow[0], elbow[1], elbow[2], 0.046, 0.046, 0.046, "RefWhite", cuts=1)
        cylinder(A, (shoulder[0], shoulder[1] - 0.06, shoulder[2]), (elbow[0], elbow[1] + 0.05, elbow[2]), 0.05, "RefBlack", r_end=0.047)  # a stripe down the sleeve
        cylinder(A, elbow, paw, 0.04, "HoundTan", r_end=0.036)
        blob(A, paw[0], paw[1], paw[2], 0.045, 0.04, 0.05, "HoundWhite", cuts=2)
        node(name, A, coll, body, shoulder)

    T = Part()
    cylinder(T, (0.0, 0.5, -0.13), (0.0, 0.72, -0.26), 0.035, "HoundTan", sides=8, r_end=0.025)
    blob(T, 0.0, 0.74, -0.27, 0.028, 0.04, 0.028, "HoundWhite", cuts=2)
    node("Referee_Tail", T, coll, body, (0.0, 0.5, -0.13))
    return coll


# ---------------------------------------------------------------------------------------------
# the trainee: a young pug skipping rope

ROPE_PIVOT = (0.0, 0.62, 0.08)


def build_trainee():
    coll, root = rig("Trainee")
    B = Part()
    for sx in (-1, 1):
        cylinder(B, (sx * 0.09, 0.38, 0.0), (sx * 0.095, 0.07, 0.01), 0.05, "PugFawn", sides=10, r_end=0.045)
        blob(B, sx * 0.1, 0.035, 0.05, 0.055, 0.035, 0.095, "Sneaker", bottom=0.0)
        blob(B, sx * 0.1, 0.07, 0.05, 0.057, 0.012, 0.06, "Sweatband", cuts=1)  # a red stripe on each sneaker
        blob(B, sx * 0.095, 0.34, 0.0, 0.08, 0.08, 0.09, "Shorts", cuts=2)
        blob(B, sx * 0.16, 0.34, 0.0, 0.01, 0.07, 0.05, "ShortStripe", cuts=1)
    blob(B, 0.0, 0.42, -0.01, 0.17, 0.08, 0.14, "Shorts", cuts=3)
    blob(B, 0.0, 0.62, -0.01, 0.16, 0.19, 0.14, "PugFawn", cuts=4)
    blob(B, 0.0, 0.6, 0.0, 0.162, 0.15, 0.142, "TankGrey", cuts=3)  # the tank top
    blob(B, 0.0, 0.74, 0.1, 0.07, 0.04, 0.04, "PugFawn", cuts=2)  # the neckline
    body = node("Trainee_Body", B, coll, root)

    H = Part()
    neck = (0.0, 0.8, 0.0)
    hy = 0.95
    blob(H, 0.0, hy, 0.0, 0.16, 0.15, 0.15, "PugFawn", cuts=4)
    blob(H, 0.0, hy - 0.04, 0.12, 0.1, 0.075, 0.05, "PugMask", cuts=3)  # the black mask, flat-faced
    blob(H, 0.0, hy - 0.02, 0.16, 0.03, 0.022, 0.015, "Nose", cuts=1)
    blob(H, 0.0, hy + 0.035, 0.14, 0.06, 0.012, 0.012, "PugMask", cuts=1)  # a worried wrinkle
    for sx in (-1, 1):
        blob(H, sx * 0.07, hy + 0.01, 0.13, 0.03, 0.032, 0.014, "Eye", cuts=1)
        blob(H, sx * 0.07 + 0.01, hy + 0.025, 0.142, 0.009, 0.01, 0.004, "Glint", cuts=1)
        blob(H, sx * 0.13, hy + 0.1, 0.0, 0.045, 0.035, 0.02, "PugMask", cuts=2)  # the folded ears
    lathe(H, 0.0, 0.0, [(0, hy + 0.07), (0.155, hy + 0.07), (0.158, hy + 0.11), (0, hy + 0.11)], "Sweatband", segs=16)
    node("Trainee_Head", H, coll, body, neck)

    # the arms bent, the hands out at the sides round the rope's handles
    for sx, name in ((-1, "Trainee_ArmR"), (1, "Trainee_ArmL")):
        A = Part()
        shoulder = (sx * 0.15, 0.74, 0.0)
        elbow = (sx * 0.21, 0.64, -0.02)
        paw = (sx * 0.25, ROPE_PIVOT[1], ROPE_PIVOT[2])
        cylinder(A, shoulder, elbow, 0.042, "PugFawn", r_end=0.038)
        blob(A, elbow[0], elbow[1], elbow[2], 0.04, 0.04, 0.04, "PugFawn", cuts=1)
        cylinder(A, elbow, paw, 0.036, "PugFawn", r_end=0.034)
        blob(A, paw[0], paw[1], paw[2], 0.04, 0.036, 0.042, "PugFawn", cuts=2)
        cylinder(A, (paw[0], paw[1] + 0.07, paw[2]), (paw[0], paw[1] - 0.05, paw[2]), 0.022, "Handle", sides=8)
        node(name, A, coll, body, shoulder)

    # the rope: from one hand round to the other, hanging down at rest (the game turns it round the
    # line through the hands: over the head, under the feet)
    R = Part()
    px, py, pz = ROPE_PIVOT
    loop = [(-0.25, -0.05), (-0.3, 0.28), (-0.28, 0.55), (-0.18, 0.63), (0.0, 0.65), (0.18, 0.63), (0.28, 0.55), (0.3, 0.28), (0.25, -0.05)]
    pts = [(x, py - d, pz) for x, d in loop]
    for a, b in zip(pts, pts[1:]):
        cylinder(R, a, b, 0.011, "RopeRed", sides=6)
    node("Trainee_Rope", R, coll, body, ROPE_PIVOT)

    T = Part()
    blob(T, 0.0, 0.52, -0.16, 0.04, 0.04, 0.035, "PugFawn", cuts=2, fluff=0.1)  # the curly tail
    blob(T, 0.02, 0.56, -0.17, 0.028, 0.028, 0.025, "PugFawn", cuts=1)
    node("Trainee_Tail", T, coll, body, (0.0, 0.52, -0.14))
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
        colls = [build_raccoon(), build_rabbit(), build_kangaroo(), build_crowd(), build_referee(), build_trainee()]
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
