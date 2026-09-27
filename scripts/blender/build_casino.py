"""The Velvet Casino: builds client/public/models/casino.glb.

Run it inside Blender, through the Live Bridge (it runs the "code" field of a POSTed JSON body,
queued: nothing comes back, and it execs with separate globals and locals, so run this file inside
a namespace of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes
to REPORT_PATH), or headless:

    blender -b -P scripts/blender/build_casino.py

Nothing is placed by hand: where everything stands comes from CASINO_LAYOUT in
shared/worlds/casino.ts (the JSON between its layout markers, read as is), and every seat's
height from its cushion in shared/seats.ts (barStool, pokerChair, clubChair, ottoman, pianoBench,
chesterfield): the same numbers the walkable floor, the colliders and the seat anchors are derived
from. A mid-century Art-Deco hall in matte clay, every material opaque.

Every colour is a VERTEX colour, and the faces share seven materials by finish, so the whole
static hall costs seven draw calls however much is in it:

    CS_Clay     matte (roughness 0.85): the carpet, the walls, wood, velvet, felt, leaves, fur
    CS_Sheen    a touch smoother (0.5): gold, brass, chrome, black lacquer, marble, mirror, leather
    CS_Polish   the lounge's dark oak herringbone parquet (0.35)
    CS_Gloss    Neon Alley's polished obsidian tiles and the foyer's diamond marble (0.15)
    CS_Glow     the lamps' bulbs, the chandeliers' crystal, the slot screens, the torches' flames,
                Madame Zara's crystal ball (the game draws it unlit, at full brightness)
    CS_Neon     Neon Alley's pink and cyan tubes and floor strip (unlit, breathing)
    CS_Decal2   what lies on a floor, a wall or the felt: the carpet's and the wallpaper's damask, the
                twin brass border, the marble's gilded veins, the runner, the tables' markings

Some light is painted in: the Art-Deco sconces' up and down beams and the picture lights wash the
walls and the canvases, and Neon Alley's tubes (and its slot screens) shine back off the obsidian
where the camera would see their reflections (bake_light): vertex colours, no lights, no textures.

(the game nudges the two decal layers toward the camera in the depth test: never a flicker).

    Casino_Static        everything that stands still, merged into ONE object:
                           the 20x20 slab and its floors, laid round each other (no zone lies on
                           another): the burgundy Art-Deco damask carpet (ogee cartouches in a
                           half-drop repeat, little stars between) with the twin brass inlay framing
                           the central pit (a stepped fan in each corner) and a gold sunburst round
                           the roulette table; a harlequin of high-gloss diamond marble in the foyer,
                           gilded veins wandering across it, a velvet runner in from the doors; Neon
                           Alley's polished obsidian tiles (the neon's reflections painted on them)
                           edged with a cyan neon strip; brass divider strips where floors meet; the
                           High-Roller Stage raised 0.35 (emerald carpet, brass-nosed double steps in
                           the middle of its front, brass cheeks where the ropes end, a brass
                           balustrade to the lounge) and the Velvet Lounge raised 0.25 (dark oak
                           herringbone, two steps all along its open sides); the two back walls (a
                           fluted walnut wainscot to 1.2 above the floor under a gilt chair rail,
                           burgundy velvet wallpaper in gold damask, a gold crown and walnut cornice,
                           fluted walnut pilasters, Art-Deco twin-beam sconces whose beams are
                           painted up and down the wall), the grand doors, the Big-Win marquee's
                           frame, the Baroque gold-leaf portraits and the 1920s posters under their
                           picture lights, a sunburst mirror; two fluted torch columns; the Golden
                           Cage; the areca palms in fluted brass urns; Madame Zara's booth (the lady
                           herself inside) and the capsule machine in the nook by the doors; the Big
                           Six's cabinet, crest, flapper and betting ledge; the roulette table, the
                           craps table, Scarlett's kidney-shaped baccarat table and its five stools,
                           the two half-moon blackjack tables against the east rail (Table 2 in blue
                           baize), their racks, shoes and discard trays on the dealers' side and their
                           stools on the floor's; the emerald horseshoe booths and their glass
                           cocktail tables; the craps table's brass posts and velvet ropes, the two
                           high-top cocktail tables and their leather stools, the baccarat's LED bead
                           road; the billiards table and its low lamps on the floor's flank; the slot
                           row and its neon, the pinball cabinets, the Turf Club's four-lane race
                           table, the two coin pushers (the High-Roller's black and gold, a crown on
                           its crest); the poker table, its five chairs and the velvet
                           ropes; the penthouse's gilded doors in the stage's back wall (fluted
                           pilasters, a lintel of bulbs, a sunburst and a crown; the elevator's brass
                           doors in the recess behind; a runner between two stanchions); the bar, the
                           back bar (bottles, mirror, an espresso machine), the stools, the
                           Chesterfield and its coffee table
                           (The Velvet Gazette on it), the baby grand on the dais's front-right apron
                           (its lid propped open to the floor, its harp and strings showing) and the
                           stage spotlight on its stand; the dealers' tip jars; the brass rail along
                           the front edges; four crystal chandeliers
    Prop_RouletteWheel   the wheel (its origin at its centre on the felt): the game spins it
    Prop_BigSixWheel     the Big Six's wheel (its origin at its hub): the game turns it about its facing
    Prop_Marquee         the Big-Win marquee's screen: a quad with UVs the game paints the news on
    Prop_ZaraOwl         Madame Zara's animatronic brass owl on her booth's roof,
      Prop_ZaraOwlHead   its head (pivoting at the neck: it swivels, and hoots at a reading)
    Prop_CrapsDie1/2     the two dice on the craps felt (origins at their centres: the game rolls them)
    Prop_DerbyHorse      one horse and rider at the Turf Club's start (the game races four of it)
    Prop_PusherPlate     the coin pusher's sliding plate
    Prop_PusherPlateHigh the High-Roller Pusher's
    Prop_CueBall         the billiards table's cue ball
    Prop_VipDoorL/R      the penthouse's two padded door leaves (origins at their hinges: the game
                         swings them out into the room for Bruno's guests)

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts (and lifts whatever is
built on a stage by its height), so every number below reads as in casino.ts.
"""

import json
import math
import os
import re
import traceback

import bmesh
import bpy
from mathutils import Vector

COLLECTION = "Casino"

PALETTE = {
    "CS_Slab": "#24140F",
    "CS_Carpet": "#5A1424",
    "CS_Inlay": "#C9A24A",
    "CS_MarbleLight": "#E6DED0",
    "CS_MarbleDark": "#2A2527",
    "CS_FloorMarbleLight": "#E6DED0",
    "CS_FloorMarbleDark": "#2A2527",
    "CS_Runner": "#7A1E2E",
    "CS_Terrazzo": "#1E1A2B",
    "CS_PitCarpet": "#143D30",
    "CS_Plank": "#5C3120",
    "CS_PlankDark": "#472516",
    "CS_Wall": "#3E1620",
    "CS_Wainscot": "#4A2317",
    "CS_Gold": "#D4A93C",
    "CS_Brass": "#C49A45",
    "CS_Mahogany": "#5A2A18",
    "CS_MahoganyDark": "#3A1A10",
    "CS_Felt": "#1F6B45",
    "CS_FeltDark": "#185A39",
    "CS_Velvet": "#7A1E2E",
    "CS_Red": "#A11A22",
    "CS_Black": "#161214",
    "CS_Ivory": "#F2E8D5",
    "CS_Leaf": "#2F6B3F",
    "CS_Trunk": "#6B5236",
    "CS_Rose": "#C2415B",
    "CS_Mirror": "#2B3140",
    "CS_BottleGreen": "#2F6B4F",
    "CS_BottleAmber": "#A0521E",
    "CS_BottleRuby": "#6E1A2A",
    "CS_SlotBody": "#8A1C2B",
    "CS_Chrome": "#C9C4BA",
    "CS_ChromeDark": "#8C877E",
    "CS_Bulb": "#FFD98A",
    "CS_Crystal": "#FFF1D0",
    "CS_SlotScreen": "#FFF3CC",
    "CS_NeonPink": "#FF4FA3",
    "CS_NeonCyan": "#4FE3FF",
    # the felt's markings
    "CS_FeltRed": "#A11A22",
    "CS_FeltBlack": "#161214",
    "CS_FeltLine": "#E8DFC8",
    "CS_FeltGold": "#C9A24A",
    "CS_FeltZero": "#26804F",
    "CS_Card": "#F4EFE4",
    # the expansion
    "CS_Flame": "#FFB347",
    "CS_FlameCore": "#FFE7A3",
    "CS_Leather": "#6B2418",
    "CS_LeatherDark": "#3A120C",
    "CS_Canvas1": "#1F3A2E",
    "CS_Canvas2": "#3E1622",
    "CS_Canvas3": "#1C2440",
    "CS_FoxFur": "#C8612A",
    "CS_FoxWhite": "#F3EBDD",
    "CS_BearFur": "#F2EFE8",
    "CS_OwlBrown": "#7A5A3A",
    "CS_OwlLight": "#D9C3A0",
    "CS_PoodleCream": "#F1E6D2",
    "CS_CatBlack": "#1C1A1F",
    "CS_CatWhite": "#F4F1EA",
    "CS_Eye": "#1B1818",
    "CS_EyeGreen": "#6BBF59",
    "CS_Amber": "#F2A33A",
    "CS_Suit": "#1E2230",
    "CS_Shirt": "#EDEFF2",
    "CS_Pearl": "#FBF8F0",
    "CS_Emerald": "#1F5A3F",
    "CS_ZaraPurple": "#4B2463",
    "CS_ZaraPlum": "#2E1640",
    "CS_ZaraTeal": "#1F6F74",
    "CS_ZaraCream": "#EFE3CF",
    "CS_ZaraMask": "#5A3B2A",
    "CS_ZaraEye": "#6FB7E8",
    "CS_CrystalBall": "#D9C8FF",
    "CS_StarGlow": "#FFE9A8",
    "CS_Bronze": "#A0673A",
    "CS_Copper": "#C07A45",
    "CS_OwlEye": "#FFC24A",
    "CS_CapRed": "#E0473E",
    "CS_CapBlue": "#3E7BE0",
    "CS_CapYellow": "#F2C94C",
    "CS_CapGreen": "#4CB86A",
    "CS_CapPink": "#F27FB2",
    "CS_CapPurple": "#9B6BE0",
    "CS_CapWhite": "#F4F1EA",
    "CS_BallYellow": "#F2C230",
    "CS_BallBlue": "#2F5FBF",
    "CS_BallRed": "#C8322B",
    "CS_BallPurple": "#6B3A99",
    "CS_BallOrange": "#E57A22",
    "CS_BallGreen": "#2E7D46",
    "CS_BallMaroon": "#7A2330",
    "CS_ShadeGreen": "#2F6B4F",
    "CS_JarGlass": "#CFE3E0",
    "CS_Paper": "#EFE8D8",
    "CS_Ink": "#3A3436",
    "CS_HorseCoat": "#E2D6C6",
    "CS_HorseDark": "#6A5A4E",
    "CS_Silk": "#F6F4EE",
    "CS_DieRed": "#C8202E",
    "CS_Pip": "#F7F3EA",
    "CS_Coin": "#E0B44A",
    "CS_Screen": "#120C10",
    # the overhaul
    "CS_VipCarpet": "#3A1446",
    "CS_FeltBlue": "#1C3F6E",
    # the definitive remaster: the floors and the walls
    "CS_Damask": "#772238",
    "CS_DamaskGold": "#8A5E2E",
    "CS_Oak": "#4A2A17",
    "CS_OakDark": "#36200F",
    "CS_OakLight": "#5A351D",
    "CS_Obsidian": "#0D0B11",
    "CS_ObsidianLight": "#15121B",
    "CS_Grout": "#2A2330",
    "CS_GlossMarbleLight": "#EEE7DA",
    "CS_GlossMarbleDark": "#17141A",
    "CS_Vein": "#D6B25C",
    "CS_Walnut": "#40261A",
    "CS_WalnutDark": "#26150C",
    "CS_Wallpaper": "#57152A",
    "CS_WallDamask": "#98703A",
    # ... and the new pieces: booths, the Big Six, palms, posters
    "CS_EmeraldLeather": "#1E5C43",
    "CS_EmeraldTuft": "#113B2A",
    "CS_Cane": "#7C8F3E",
    "CS_Areca": "#3F7A3A",
    "CS_ArecaLight": "#5E9444",
    "CS_SixSky": "#4F9FD8",
    "CS_SixGreen": "#2E8A57",
    "CS_SixViolet": "#7B4FC4",
    "CS_SixOrange": "#E0842C",
    "CS_Teal": "#1F5E63",
    # the ecosystem overhaul: the hall baccarat's navy felt, its bead-road sign's LEDs
    "CS_FeltNavy": "#0F2042",
    "CS_LedRed": "#FF4A4A",
    "CS_LedBlue": "#4A9BFF",
    "CS_LedGreen": "#4AFF95",
}

# which of the six shared materials each colour is painted with
GLOW = {"CS_Bulb", "CS_Crystal", "CS_SlotScreen", "CS_Flame", "CS_FlameCore", "CS_CrystalBall", "CS_StarGlow", "CS_LedRed", "CS_LedBlue", "CS_LedGreen"}
NEON = {"CS_NeonPink", "CS_NeonCyan"}
DECAL1 = {"CS_FloorMarbleLight", "CS_FloorMarbleDark", "CS_Terrazzo"}
DECAL2 = {"CS_Runner", "CS_Inlay", "CS_FeltRed", "CS_FeltBlack", "CS_FeltLine", "CS_FeltGold", "CS_FeltZero", "CS_Card", "CS_Ink", "CS_Damask", "CS_DamaskGold", "CS_Vein", "CS_WallDamask"}
# the floors that shine: the lounge's oak parquet, and the alley's obsidian and the foyer's marble
POLISH = {"CS_Oak", "CS_OakDark", "CS_OakLight"}
GLOSS = {"CS_Obsidian", "CS_ObsidianLight", "CS_GlossMarbleLight", "CS_GlossMarbleDark"}
SHEEN = {
    "CS_Gold", "CS_Brass", "CS_Chrome", "CS_ChromeDark", "CS_Black", "CS_Mirror", "CS_MarbleLight", "CS_MarbleDark", "CS_JarGlass", "CS_Bronze", "CS_Copper",
    "CS_Coin", "CS_Leather", "CS_LeatherDark", "CS_Pearl", "CS_DieRed", "CS_Pip", "CS_OwlEye",
    "CS_BallYellow", "CS_BallBlue", "CS_BallRed", "CS_BallPurple", "CS_BallOrange", "CS_BallGreen", "CS_BallMaroon",
    "CS_CapRed", "CS_CapBlue", "CS_CapYellow", "CS_CapGreen", "CS_CapPink", "CS_CapPurple", "CS_CapWhite",
    "CS_BottleGreen", "CS_BottleAmber", "CS_BottleRuby", "CS_Ivory",
    "CS_EmeraldLeather", "CS_EmeraldTuft", "CS_SixSky", "CS_SixGreen", "CS_SixViolet", "CS_SixOrange",
}
CATEGORIES = {"CS_Clay": 0.85, "CS_Sheen": 0.5, "CS_Glow": 0.8, "CS_Neon": 0.8, "CS_Decal1": 0.8, "CS_Decal2": 0.65, "CS_Polish": 0.35, "CS_Gloss": 0.15}


def category(name):
    if name in GLOW:
        return "CS_Glow"
    if name in NEON:
        return "CS_Neon"
    if name in DECAL1:
        return "CS_Decal1"
    if name in DECAL2:
        return "CS_Decal2"
    if name in POLISH:
        return "CS_Polish"
    if name in GLOSS:
        return "CS_Gloss"
    if name in SHEEN:
        return "CS_Sheen"
    return "CS_Clay"


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))


# Whatever stands on a stage is built at its own height over the stage and lifted by it here.
LIFT = [0.0]


class lifted:
    def __init__(self, h):
        self.h = h

    def __enter__(self):
        self.old = LIFT[0]
        LIFT[0] = self.h

    def __exit__(self, *exc):
        LIFT[0] = self.old


def W(x, y, z):
    """The game's (x, y up, z) as a Blender point (lifted onto the stage being built on)."""
    return Vector((x, -z, y + LIFT[0]))


# ---------------------------------------------------------------------------------------------
# reading the layout and the cushions out of the game's sources


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_casino.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def read_layout(root):
    src = open(os.path.join(root, "shared", "worlds", "casino.ts"), encoding="utf-8").read()
    body = re.search(r"/\* layout:begin \*/(.*?)/\* layout:end \*/", src, re.S).group(1)
    return json.loads(body)


CUSHIONS = {}


def read_cushions(root):
    src = open(os.path.join(root, "shared", "seats.ts"), encoding="utf-8").read()
    out = CUSHIONS
    for name in ("barStool", "pokerChair", "clubChair", "ottoman", "pianoBench", "chesterfield"):
        m = re.search(rf"\b{name}: \{{ y: (-?[0-9.]+), h: ([0-9.]+) \}}", src)
        y, h = float(m.group(1)), float(m.group(2))
        out[name] = {"y": y, "h": h, "top": y + h / 2}
    return out


def stage(L, sid):
    return next(s for s in L["stages"] if s["id"] == sid)


def floor_y(L, x, z):
    """The floor's height at (x, z): shared/worlds/casino.ts casinoFloorY, the same treads."""
    best = 0.0
    for s in L["stages"]:
        if s["x0"] <= x <= s["x1"] and s["z0"] <= z <= s["z1"]:
            best = max(best, s["h"])
            continue
        cx, cz = max(s["x0"], min(s["x1"], x)), max(s["z0"], min(s["z1"], z))
        d = max(abs(x - cx), abs(z - cz))
        if d > s["depth"]:
            continue
        edges = []
        if x > s["x1"]:
            edges.append(("x1", cz))
        if x < s["x0"]:
            edges.append(("x0", cz))
        if z > s["z1"]:
            edges.append(("z1", cx))
        if z < s["z0"]:
            edges.append(("z0", cx))
        if all(any(o["edge"] == e and min(o["from"], o["to"]) - 1e-6 <= a <= max(o["from"], o["to"]) + 1e-6 for o in s["open"]) for e, a in edges):
            k = min(s["count"] - 1, int((d / s["depth"]) * s["count"]))
            best = max(best, s["h"] * (s["count"] - k) / (s["count"] + 1))
    return best


# ---------------------------------------------------------------------------------------------
# a mesh: every part adds its faces to it, each face tagged with its palette colour


class Mesh:
    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []
        # the static hall's painted light (bake_light); the nodes have none
        self.lit = False
        # faces built flat keep the facing they were given (made before any face: a layer added
        # later would invalidate the faces already held)
        self.bm.faces.layers.int.new("flat")

    def m(self, name):
        """The slot of colour `name` in this mesh (added on first use)."""
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def flat_layer(self):
        return self.bm.faces.layers.int.get("flat") or self.bm.faces.layers.int.new("flat")


def poly_area(pts):
    return 0.5 * abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])))


def flat(M, pts, mat, normal):
    """One flat polygon through the game points `pts`, facing along the game vector `normal`: a
    tile, a plank, a decal. Built single-sided and kept that way (never turned by the normals'
    recalculation, which a lone face could fool)."""
    if len(pts) < 3:
        return None
    bm = M.bm
    vs = [bm.verts.new(W(*q)) for q in pts]
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return None
    f.material_index = M.m(mat)
    f.normal_update()
    want = Vector((normal[0], -normal[2], normal[1]))
    if f.normal.dot(want) < 0:
        f.normal_flip()
    f[M.flat_layer()] = 1
    return f


def floor_poly(M, pts2, y, mat):
    """A flat (x, z) polygon lying at height y, facing up."""
    if len(pts2) >= 3 and poly_area(pts2) > 1e-6:
        flat(M, [(x, y, z) for x, z in pts2], mat, (0.0, 1.0, 0.0))


def clip_rect(poly, x0, x1, z0, z1):
    """A polygon clipped to a rectangle (Sutherland-Hodgman)."""

    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia:
                    out.append(inter(a, b))
                out.append(b)
            elif ia:
                out.append(inter(a, b))
        return out

    def at_x(k):
        return lambda a, b: (k, a[1] + (b[1] - a[1]) * (k - a[0]) / (b[0] - a[0]))

    def at_z(k):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (k - a[1]) / (b[1] - a[1]), k)

    pts = list(poly)
    for inside, inter in ((lambda q: q[0] >= x0, at_x(x0)), (lambda q: q[0] <= x1, at_x(x1)), (lambda q: q[1] >= z0, at_z(z0)), (lambda q: q[1] <= z1, at_z(z1))):
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts


def rounded_rect(x0, x1, z0, z1, r, per_corner=6):
    """An (x, z) outline of a rounded rectangle, going round once."""
    r = min(r, (x1 - x0) / 2, (z1 - z0) / 2)
    corners = [(x1 - r, z1 - r, 0.0), (x0 + r, z1 - r, math.pi / 2), (x0 + r, z0 + r, math.pi), (x1 - r, z0 + r, 1.5 * math.pi)]
    out = []
    for cx, cz, a0 in corners:
        for k in range(per_corner + 1):
            a = a0 + (math.pi / 2) * k / per_corner
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


def circle(cx, cz, r, n=24):
    return [(cx + r * math.cos(2 * math.pi * k / n), cz + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def slab(M, outline, y0, y1, mat, top=None):
    """The (x, z) `outline` extruded from y0 to y1."""
    bm = M.bm
    lo = [bm.verts.new(W(x, y0, z)) for x, z in outline]
    hi = [bm.verts.new(W(x, y1, z)) for x, z in outline]
    bm.faces.new(list(reversed(lo))).material_index = M.m(mat)
    bm.faces.new(hi).material_index = M.m(top or mat)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = M.m(mat)


def box(M, x0, x1, y0, y1, z0, z1, mat, top=None):
    slab(M, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1, mat, top)


def obox(M, cx, cz, yaw, f0, f1, r0, r1, y0, y1, mat):
    """A box turned to heading `yaw` (0 faces +z): f along the heading, r across it."""
    f = (math.sin(yaw), math.cos(yaw))
    r = (f[1], -f[0])
    pts = [(cx + f[0] * a + r[0] * b, cz + f[1] * a + r[1] * b) for a, b in ((f0, r0), (f1, r0), (f1, r1), (f0, r1))]
    slab(M, pts, y0, y1, mat)


def vslab(M, outline_xy, z0, z1, mat):
    """An (x, y) outline extruded along z from z0 to z1 (a flat shape standing on a wall)."""
    bm = M.bm
    a = [bm.verts.new(W(x, y, z0)) for x, y in outline_xy]
    b = [bm.verts.new(W(x, y, z1)) for x, y in outline_xy]
    bm.faces.new(list(reversed(a))).material_index = M.m(mat)
    bm.faces.new(b).material_index = M.m(mat)
    n = len(outline_xy)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def xslab(M, outline_zy, x0, x1, mat):
    """A (z, y) outline extruded along x from x0 to x1 (a flat shape standing on the x wall)."""
    bm = M.bm
    a = [bm.verts.new(W(x0, y, z)) for z, y in outline_zy]
    b = [bm.verts.new(W(x1, y, z)) for z, y in outline_zy]
    bm.faces.new(list(reversed(a))).material_index = M.m(mat)
    bm.faces.new(b).material_index = M.m(mat)
    n = len(outline_zy)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def band(M, outer, inner, y0, y1, mat, closed=True):
    """The strip between two matching (x, z) outlines, from y0 to y1: a ring (or an arc, open)."""
    bm = M.bm
    n = len(outer)
    oa = [bm.verts.new(W(x, y0, z)) for x, z in outer]
    ob = [bm.verts.new(W(x, y1, z)) for x, z in outer]
    ia = [bm.verts.new(W(x, y0, z)) for x, z in inner]
    ib = [bm.verts.new(W(x, y1, z)) for x, z in inner]
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for quad in ((ob[i], ob[j], ib[j], ib[i]), (oa[j], oa[i], ia[i], ia[j]), (oa[i], oa[j], ob[j], ob[i]), (ia[j], ia[i], ib[i], ib[j])):
            bm.faces.new(quad).material_index = M.m(mat)
    if not closed:
        for k in (0, n - 1):
            bm.faces.new((oa[k], ob[k], ib[k], ia[k])).material_index = M.m(mat)


def cylinder(M, a, b, r, mat, sides=12, r_end=None):
    """A round bar between the game points a and b, radius r (tapering to r_end), capped."""
    bm = M.bm
    pa, pb = W(*a), W(*b)
    axis = (pb - pa).normalized()
    n = axis.orthogonal().normalized()
    q = axis.cross(n)
    re_ = r if r_end is None else r_end
    ring_a = [bm.verts.new(pa + (n * math.cos(t) + q * math.sin(t)) * r) for t in (2 * math.pi * k / sides for k in range(sides))]
    ring_b = [bm.verts.new(pb + (n * math.cos(t) + q * math.sin(t)) * re_) for t in (2 * math.pi * k / sides for k in range(sides))]
    for k in range(sides):
        k1 = (k + 1) % sides
        f = bm.faces.new((ring_a[k], ring_a[k1], ring_b[k1], ring_b[k]))
        f.material_index = M.m(mat)
        f.smooth = True
    for ring in (ring_a, list(reversed(ring_b))):
        bm.faces.new(ring).material_index = M.m(mat)


def lathe(M, cx, cz, profile, mat, segs=16, y0=0.0):
    """A solid of revolution about the vertical through (cx, cz): (radius, height) points from the
    bottom centre (r = 0) to the top centre (r = 0)."""
    bm = M.bm
    bottom = bm.verts.new(W(cx, y0 + profile[0][1], cz))
    top = bm.verts.new(W(cx, y0 + profile[-1][1], cz))
    rings = [[bm.verts.new(W(cx + r * math.cos(2 * math.pi * k / segs), y0 + h, cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)] for r, h in profile[1:-1]]
    faces = []
    for k in range(segs):
        k1 = (k + 1) % segs
        faces.append(bm.faces.new((bottom, rings[0][k1], rings[0][k])))
        faces.append(bm.faces.new((top, rings[-1][k], rings[-1][k1])))
        for r0, r1 in zip(rings, rings[1:]):
            faces.append(bm.faces.new((r0[k], r0[k1], r1[k1], r1[k])))
    for f in faces:
        f.material_index = M.m(mat)
        f.smooth = True


def blob(M, cx, cy, cz, hx, hy, hz, mat, cuts=3, n=2.2, yaw=0.0, droop=0.0, pitch=0.0):
    """A rounded lump (a superellipsoid) centred at the game point (cx, cy, cz), its x half-size
    along heading `yaw`; `droop` bends its ends down (a palm frond), `pitch` tips it forward."""
    bm = M.bm
    for v in bm.verts:
        v.tag = True
    made = bmesh.ops.create_cube(bm, size=2.0)
    edges = list({e for v in made["verts"] for e in v.link_edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    new = [v for v in bm.verts if not v.tag]
    c, s = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    for v in new:
        d = v.co.normalized()
        k = (abs(d.x) ** n + abs(d.y) ** n + abs(d.z) ** n) ** (1 / n)
        q = d / k
        lx, ly, lz = q.x * hx, q.z * hy, -q.y * hz
        ly -= droop * (q.x * q.x)
        ly, lz = ly * cp - lz * sp, ly * sp + lz * cp
        v.co = W(cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c)
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = M.m(mat)
        f.smooth = True
    for v in bm.verts:
        v.tag = False


# on a wall: `u` across it (to the viewer's right), `v` up, `d` out of it into the room


def wall_face(L):
    return -L["half"] + L["walls"]["t"]


def wbox(M, L, wall, at, u0, u1, v0, v1, d0, d1, mat):
    face = wall_face(L)
    if wall == "z":
        box(M, at + u0, at + u1, v0, v1, face + d0, face + d1, mat)
    else:
        box(M, face + d0, face + d1, v0, v1, at - u1, at - u0, mat)


def wblob(M, L, wall, at, u, v, d, hu, hv, hd, mat, cuts=2, n=2.2):
    face = wall_face(L)
    if wall == "z":
        blob(M, at + u, v, face + d, hu, hv, hd, mat, cuts=cuts, n=n)
    else:
        blob(M, face + d, v, at - u, hu, hv, hd, mat, cuts=cuts, n=n, yaw=math.pi / 2)


def wshape(M, L, wall, at, outline_uv, d0, d1, mat):
    """A flat (u, v) outline standing out of a wall from d0 to d1."""
    face = wall_face(L)
    if wall == "z":
        vslab(M, [(at + u, v) for u, v in outline_uv], face + d0, face + d1, mat)
    else:
        xslab(M, [(at - u, v) for u, v in outline_uv], face + d0, face + d1, mat)


def wbar(M, L, wall, at, a, b, d, r, mat, sides=8):
    """A round bar along a wall between (u, v) points a and b, `d` out of it."""
    face = wall_face(L)
    if wall == "z":
        cylinder(M, (at + a[0], a[1], face + d), (at + b[0], b[1], face + d), r, mat, sides=sides)
    else:
        cylinder(M, (face + d, a[1], at - a[0]), (face + d, b[1], at - b[0]), r, mat, sides=sides)


# ---------------------------------------------------------------------------------------------
# Blender plumbing: six shared materials, vertex colours


def studio(root, call, *args):
    """The Blender studio (scripts/blender/studio.py, run fresh from disk): "begin" before the
    build (a headless run joins the master file), "finish" after the export (the collections to
    their place on the studio grid, the .blend saved). A studio failure never fails the export."""
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


def purge():
    old = bpy.data.collections.get(COLLECTION)
    for o in list(old.all_objects) if old else []:
        bpy.data.objects.remove(o, do_unlink=True)
    if old:
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


# The painted light (bake_light): each a function of a vertex's game position and colour, applied to
# the static hall's faces near what it lights. Filled in by build() from the layout.
LIGHTS = []


def bake_light(bm, col):
    """Paints the light in: every loop's colour through every light that reaches it."""
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            gx, gy, gz = co.x, co.z, -co.y
            c = loop[col]
            rgb = (c[0], c[1], c[2])
            changed = False
            for fn in LIGHTS:
                out = fn(gx, gy, gz, rgb)
                if out is not None:
                    rgb = out
                    changed = True
            if changed:
                loop[col] = (min(1.0, rgb[0]), min(1.0, rgb[1]), min(1.0, rgb[2]), 1.0)


def soft_window(v, a, b, edge):
    """1 between a and b, easing to 0 over `edge` either side."""
    return max(0.0, min(1.0, (v - a) / edge + 0.5)) * max(0.0, min(1.0, (b - v) / edge + 0.5))


def wall_lights(L, sconces, pictures):
    """The sconces' up and down beams on the walls (and what hangs on them), and each picture's lamp
    on its canvas. `sconces`: (wall, u, y); `pictures`: (wall, u, y_top, half width)."""
    face = wall_face(L)
    warm = lin("#FFC98A")

    def fn(gx, gy, gz, rgb):
        on_z = gz - face < 0.3
        on_x = gx - face < 0.3
        if not (on_z or on_x):
            return None
        k = 0.0
        for wall, u, y in sconces:
            if (wall == "z" and not on_z) or (wall == "x" and not on_x):
                continue
            du = (gx if wall == "z" else gz) - u
            if abs(du) > 1.6:
                continue
            dv = gy - y
            core = math.exp(-(du * du + dv * dv) / 0.03)
            beam = 0.0
            if abs(dv) > 0.02:
                up = dv > 0
                reach = abs(dv)
                spread = 0.07 + reach * 0.42  # the beam's half width, widening as it goes
                across = max(0.0, 1.0 - (abs(du) / spread) ** 2)
                beam = across * math.exp(-reach / (1.6 if up else 1.1)) * (1.0 if up else 0.85)
            k += 2.2 * core + 2.4 * beam
        for wall, u, ytop, hw in pictures:
            if (wall == "z" and not on_z) or (wall == "x" and not on_x):
                continue
            du = (gx if wall == "z" else gz) - u
            if abs(du) > hw + 0.1 or gy > ytop + 0.05 or gy < ytop - 1.4:
                continue
            k += 0.9 * soft_window(du, -hw, hw, 0.2) * math.exp(-(ytop - gy) / 0.45)
        if k <= 0.003:
            return None
        return (rgb[0] * (1 + 1.5 * k) + warm[0] * 0.05 * k, rgb[1] * (1 + 1.5 * k) + warm[1] * 0.05 * k, rgb[2] * (1 + 1.5 * k) + warm[2] * 0.05 * k)

    return fn


def neon_reflection(L):
    """Neon Alley's tubes and slot screens shining back off the polished obsidian: where the camera
    (looking down (-1, -1, -1)) sees each one's mirror image, a point at height h on the wall at
    (x, z) shows on the floor at (x + h, z + h), blurred as a gloss would blur it."""
    face = wall_face(L)
    ne = L["neon"]
    z0, z1, yb = ne["from"], ne["to"], ne["y"]
    cyan, pink, screen = lin("#4FE3FF"), lin("#FF4FA3"), lin("#FFE9B0")
    a = next(z for z in L["zones"] if z["id"] == "alley")
    s = L["slots"]
    tubes = [(yb - 0.08, cyan, 0.17, 0.75), (yb + 0.38, cyan, 0.2, 0.55), (yb + 0.15, pink, 0.24, 0.95)]
    xs = face + 0.05
    machines = [(z, k) for k, z in enumerate(s["zs"])] + [(s["jasper"], -1)]
    top = s["h"] - 0.12

    def fn(gx, gy, gz, rgb):
        if gy > 0.02 or not (a["x0"] <= gx <= a["x1"] and a["z0"] <= gz <= a["z1"]):
            return None
        add = [0.0, 0.0, 0.0]
        for h, c, sig, k in tubes:
            dx = gx - (xs + h)
            if abs(dx) > 3 * sig:
                continue
            i = k * math.exp(-dx * dx / (2 * sig * sig)) * soft_window(gz - h, z0, z1, 0.5)
            add = [add[j] + c[j] * i for j in range(3)]
        for z, k in machines:
            # the screen's warm glow, and the machine's own little neon over it
            sx, sy = s["x"] + s["d"] / 2 - 0.15, 1.19
            dx, dz = gx - (sx + sy), gz - (z + sy)
            i = 0.4 * math.exp(-dx * dx / 0.05 - dz * dz / 0.16)
            add = [add[j] + screen[j] * i for j in range(3)]
            c = screen if k < 0 else (cyan if k % 2 == 0 else pink)
            dx, dz = gx - (sx + top), gz - (z + top)
            i = 0.45 * math.exp(-dx * dx / 0.03 - dz * dz / 0.12)
            add = [add[j] + c[j] * i for j in range(3)]
        if max(add) < 0.002:
            return None
        return (rgb[0] + add[0] * 0.6, rgb[1] + add[1] * 0.6, rgb[2] + add[2] * 0.6)

    return fn


def material(name):
    """A shared finish: its colour comes from the faces' vertex colours."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    if name == "CS_Screen":
        bsdf.inputs["Base Color"].default_value = (*lin(PALETTE["CS_Screen"]), 1)
    else:
        attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) or nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    rough = CATEGORIES.get(name, 0.8)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    m.roughness = rough
    m.use_backface_culling = True
    return m


def make_object(name, M, coll, origin=None, force=None, parent=None, recalc=True, coloured=True):
    """The mesh `M` as an object `name`, its origin at the game point `origin` (under `parent`, whose
    own origin is `parent["origin"]`). Each face is painted its colour and given its finish's
    material (`force`: one finish for the whole object, a single draw call). Its faces are turned to
    face outward first (the three.js runtime culls back faces)."""
    bm = M.bm
    lay_flat = bm.faces.layers.int.get("flat")
    if lay_flat is not None:
        flat_verts = list({v for f in bm.faces if f[lay_flat] for v in f.verts})
        if flat_verts:
            bmesh.ops.remove_doubles(bm, verts=flat_verts, dist=1e-5)
    if recalc:
        lay = bm.faces.layers.int.get("flat")
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not (lay and f[lay])])
    cats = []
    if coloured:
        col = bm.loops.layers.float_color.new("Col")
        rgba = [(*lin(PALETTE[c]), 1.0) for c in M.mats]
        for f in bm.faces:
            cat = force or category(M.mats[f.material_index])
            for loop in f.loops:
                loop[col] = rgba[f.material_index]
            if cat not in cats:
                cats.append(cat)
            f.material_index = cats.index(cat)
        if M.lit and LIGHTS:
            bake_light(bm, col)
    else:
        cats = [force or "CS_Screen"]
        for f in bm.faces:
            f.material_index = 0
    me = bpy.data.meshes.new(name + "Mesh")
    if origin is not None:
        shift = W(*origin)
        for v in bm.verts:
            v.co -= shift
    bm.to_mesh(me)
    bm.free()
    for c in cats:
        me.materials.append(material(c))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob["origin"] = list(origin) if origin is not None else [0.0, 0.0, 0.0]
    if parent is not None:
        ob.parent = parent
        po = parent["origin"]
        ob.location = W(origin[0] - po[0], origin[1] - po[1], origin[2] - po[2])
    elif origin is not None:
        ob.location = W(*origin)
    return ob


# ---------------------------------------------------------------------------------------------
# the floor: the slab, the carpet, the foyer's marble, the alley's terrazzo, the gold inlays, the
# brass dividers


INLAY = 0.004  # a gold inlay over the carpet
DAMASK = 0.0015  # the damask's motifs, flat on the carpet and the wallpaper


def zone(L, zid):
    return next(z for z in L["zones"] if z["id"] == zid)


def frame_strips(M, x0, x1, z0, z1, w, y0, y1, mat):
    """A rectangle's outline as four strips `w` wide, just inside it."""
    box(M, x0, x1, y0, y1, z0, z0 + w, mat)
    box(M, x0, x1, y0, y1, z1 - w, z1, mat)
    box(M, x0, x0 + w, y0, y1, z0 + w, z1 - w, mat)
    box(M, x1 - w, x1, y0, y1, z0 + w, z1 - w, mat)


def damask_motif():
    """One Royal Damask motif, in a unit cell (u across, v up, both -0.5 to 0.5): an ogee cartouche
    (a pointed onion outline), a lozenge at its heart, four acanthus leaves round it, a trefoil
    finial and a stem, and a half palmette at either side. (polygon, "body" or "accent") pairs."""
    out = []
    n = 14

    def half(width, v0, v1):
        pts = []
        for k in range(n + 1):
            t = k / n
            v = v0 + (v1 - v0) * t
            w = width * math.sin(math.pi * t) ** 0.85 * (1 - 0.42 * t ** 3)
            pts.append((w, v))
        return pts

    outer = half(0.3, -0.44, 0.44)
    inner = half(0.25, -0.395, 0.395)
    for sx in (-1, 1):
        for k in range(n):
            quad = [(sx * outer[k][0], outer[k][1]), (sx * outer[k + 1][0], outer[k + 1][1]), (sx * inner[k + 1][0], inner[k + 1][1]), (sx * inner[k][0], inner[k][1])]
            if poly_area(quad) > 1e-6:
                out.append((quad, "body"))
    out.append(([(0.0, 0.2), (0.075, 0.0), (0.0, -0.2), (-0.075, 0.0)], "accent"))

    def leaf(cx, cv, ang, length, width):
        pts = []
        for k in range(8):
            t = k / 8 * 2 * math.pi
            r = 1.0 if k != 0 else 1.6  # the leaf's point
            lu, lv = math.cos(t) * length * r, math.sin(t) * width
            pts.append((cx + lu * math.cos(ang) - lv * math.sin(ang), cv + lu * math.sin(ang) + lv * math.cos(ang)))
        return pts

    for sx in (-1, 1):
        out.append((leaf(sx * 0.13, 0.13, math.radians(90 - sx * 50), 0.075, 0.035), "body"))
        out.append((leaf(sx * 0.13, -0.15, math.radians(-90 + sx * 50), 0.07, 0.032), "body"))
    for cx, cv, r in ((0.0, 0.515, 0.036), (-0.048, 0.487, 0.03), (0.048, 0.487, 0.03)):
        out.append(([(cx + r * math.cos(2 * math.pi * k / 6), cv + r * math.sin(2 * math.pi * k / 6)) for k in range(6)], "body"))
    out.append(([(-0.018, -0.44), (0.018, -0.44), (0.012, -0.5), (-0.012, -0.5)], "body"))
    for sx in (-1, 1):
        arc = [(sx * (0.5 - 0.1 * math.cos(math.radians(a))), 0.16 * math.sin(math.radians(a))) for a in range(-80, 81, 20)]
        inner_arc = [(sx * (0.5 - 0.05 * math.cos(math.radians(a))), 0.11 * math.sin(math.radians(a))) for a in range(80, -81, -20)]
        out.append((arc + inner_arc, "body"))
    return out


DAMASK_MOTIF = damask_motif()


def lay_damask(M, place, size, body, accent):
    """One motif through `place((u, v)) -> game point`, `size` across."""
    normal = place(None)
    for pts, part in DAMASK_MOTIF:
        flat(M, [place((u * size, v * size)) for u, v in pts], body if part == "body" else accent, normal)


def pit_border(L):
    """The twin brass inlay that frames the central gaming pit: round the craps and roulette tables,
    the blackjack tables and the baccarat table (x0, x1, z0, z1, corner radius)."""
    return (-3.9, 9.3, -2.4, 9.3, 0.7)


def build_floor(M, L):
    h = L["half"]
    face = wall_face(L)
    f = zone(L, "foyer")
    a = zone(L, "alley")
    # the slab's dark sides and underside (its top is the floors, laid round each other)
    slab(M, [(-h, -h), (h, -h), (h, h), (-h, h)], -0.6, -0.002, "CS_Slab")

    # 2 the main floor: burgundy Art-Deco damask carpet everywhere the foyer and the alley are not
    for x0, x1, z0, z1 in ((-h, f["x0"], -h, a["z0"]), (f["x0"], h, f["z1"], a["z0"]), (a["x1"], h, a["z0"], a["z1"]), (-h, h, a["z1"], h)):
        # (the alley runs to the front railing: no strip of carpet is left in front of it)
        if x1 - x0 > 1e-6 and z1 - z0 > 1e-6:
            floor_poly(M, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], 0.0, "CS_Carpet")
    # the damask: a half-drop repeat over the open carpet (none under the stages, round the
    # roulette's sunburst, across the brass border, or under the tables)
    bx0, bx1, bz0, bz1, br = pit_border(L)
    rx, rz = L["roulette"]["x"], L["roulette"]["z"]
    skip = [(s["x0"] - s["depth"], s["x1"] + s["depth"], s["z0"] - s["depth"], s["z1"] + s["depth"]) for s in L["stages"]]
    skip += [(f["x0"], h, -h, f["z1"]), (-h, a["x1"], a["z0"], a["z1"])]
    cr = L["craps"]
    skip.append((cr["x"] - cr["len"] / 2 - 0.1, cr["x"] + cr["len"] / 2 + 0.1, cr["z"] - cr["w"] / 2 - 0.1, cr["z"] + cr["w"] / 2 + 0.1))
    hb = L["hallBaccarat"]
    if hb.get("face", 1) > 0:
        skip.append((hb["x"] - hb["a"], hb["x"] + hb["a"], hb["z"] - 0.4, hb["z"] + hb["b"]))
    else:
        skip.append((hb["x"] - hb["a"], hb["x"] + hb["a"], hb["z"] - hb["b"], hb["z"] + 0.4))
    for t in L["blackjack"]["tables"]:
        skip.append((t["x"] - 1.1, t["x"] + 0.7, t["z"] - 1.1, t["z"] + 1.1))
    step = 1.1
    size = 0.92
    col = 0
    x = -h + step / 2
    while x < h:
        z = -h + step / 2 + (step / 2 if col % 2 else 0.0)
        while z < h:
            ok = not any(x0 - 0.35 < x < x1 + 0.35 and z0 - 0.35 < z < z1 + 0.35 for x0, x1, z0, z1 in skip)
            ok = ok and math.hypot(x - rx, z - rz) > L["roulette"]["sunburst"] + 0.5
            near_border = min(abs(x - bx0), abs(x - bx1)) < 0.6 and bz0 - 0.6 < z < bz1 + 0.6 or min(abs(z - bz0), abs(z - bz1)) < 0.6 and bx0 - 0.6 < x < bx1 + 0.6
            ok = ok and not near_border and -h + 0.5 < x < h - 0.5 and -h + 0.5 < z < h - 0.5
            if ok:
                lay_damask(M, lambda uv, x=x, z=z: (0.0, 1.0, 0.0) if uv is None else (x + uv[0], DAMASK, z - uv[1]), size, "CS_Damask", "CS_DamaskGold")
            # a little four-point star between the motifs
            sx_, sz_ = x + step / 2, z + step / 4
            if not any(x0 - 0.2 < sx_ < x1 + 0.2 and z0 - 0.2 < sz_ < z1 + 0.2 for x0, x1, z0, z1 in skip) and math.hypot(sx_ - rx, sz_ - rz) > L["roulette"]["sunburst"] + 0.3 and -h + 0.3 < sx_ < h - 0.3 and -h + 0.3 < sz_ < h - 0.3:
                if not (min(abs(sx_ - bx0), abs(sx_ - bx1)) < 0.3 and bz0 - 0.3 < sz_ < bz1 + 0.3 or min(abs(sz_ - bz0), abs(sz_ - bz1)) < 0.3 and bx0 - 0.3 < sx_ < bx1 + 0.3):
                    floor_poly(M, [(sx_, sz_ - 0.07), (sx_ + 0.02, sz_ - 0.02), (sx_ + 0.07, sz_), (sx_ + 0.02, sz_ + 0.02), (sx_, sz_ + 0.07), (sx_ - 0.02, sz_ + 0.02), (sx_ - 0.07, sz_), (sx_ - 0.02, sz_ - 0.02)], DAMASK, "CS_DamaskGold")
            z += step
        x += step
        col += 1
    # the twin brass border round the pit, a stepped Deco fan in each corner
    for inset in (0.0, 0.16):
        o = rounded_rect(bx0 + inset, bx1 - inset, bz0 + inset, bz1 - inset, br - inset, per_corner=10)
        i = rounded_rect(bx0 + inset + 0.055, bx1 - inset - 0.055, bz0 + inset + 0.055, bz1 - inset - 0.055, br - inset - 0.055, per_corner=10)
        band(M, o, i, 0.0, INLAY, "CS_Inlay")
    for cx, cz, a0 in ((bx0 + br, bz0 + br, math.pi), (bx1 - br, bz0 + br, 1.5 * math.pi), (bx1 - br, bz1 - br, 0.0), (bx0 + br, bz1 - br, 0.5 * math.pi)):
        for k in range(3):
            r1 = 0.2 + k * 0.1
            pts = [(cx + r1 * math.cos(a0 + math.pi / 2 * t / 6), cz + r1 * math.sin(a0 + math.pi / 2 * t / 6)) for t in range(7)]
            pts_in = [(cx + (r1 - 0.035) * math.cos(a0 + math.pi / 2 * t / 6), cz + (r1 - 0.035) * math.sin(a0 + math.pi / 2 * t / 6)) for t in range(6, -1, -1)]
            floor_poly(M, pts + pts_in, INLAY * 0.5, "CS_Inlay")
    # a gold octagon and a sunburst round the roulette table
    sun = L["roulette"]["sunburst"]
    band(M, circle(rx, rz, 2.4, 8), circle(rx, rz, 2.33, 8), 0.0, INLAY, "CS_Inlay")
    for k in range(16):
        a0 = 2 * math.pi * (k + 0.35) / 16
        a1 = 2 * math.pi * (k + 0.65) / 16
        am = (a0 + a1) / 2
        slab(M, [(rx + 2.48 * math.cos(a0), rz + 2.48 * math.sin(a0)), (rx + sun * math.cos(am), rz + sun * math.sin(am)), (rx + 2.48 * math.cos(a1), rz + 2.48 * math.sin(a1))], 0.0, INLAY, "CS_Inlay")

    # 1 the foyer: high-gloss diamond checkerboard marble with gilded veins, a velvet runner in
    # from the doors
    # a harlequin: rhombi long along (1, 1), the camera's up and down, so they stand as tall diamonds
    # on the screen
    fx0, fx1, fz0, fz1 = f["x0"], f["x1"], f["z0"], f["z1"]
    import random

    rnd = random.Random(7)
    d1, d2 = 1.5, 0.62  # the long diagonal (along (1, 1)) and the short one (along (1, -1))
    ux, uz = 1 / math.sqrt(2), 1 / math.sqrt(2)
    vx, vz = 1 / math.sqrt(2), -1 / math.sqrt(2)
    ax_, az_ = ux * d1 / 2 + vx * d2 / 2, uz * d1 / 2 + vz * d2 / 2
    bx2, bz2 = ux * d1 / 2 - vx * d2 / 2, uz * d1 / 2 - vz * d2 / 2
    ocx, ocz = (fx0 + fx1) / 2, (fz0 + fz1) / 2
    n_ = 16
    for i in range(-n_, n_ + 1):
        for j in range(-n_, n_ + 1):
            cx = ocx + i * ax_ + j * bx2
            cz = ocz + i * az_ + j * bz2
            if not (fx0 - d1 < cx < fx1 + d1 and fz0 - d1 < cz < fz1 + d1):
                continue
            diamond = [(cx - ux * d1 / 2, cz - uz * d1 / 2), (cx + vx * d2 / 2, cz + vz * d2 / 2), (cx + ux * d1 / 2, cz + uz * d1 / 2), (cx - vx * d2 / 2, cz - vz * d2 / 2)]
            pts = clip_rect(diamond, fx0, fx1, fz0, fz1)
            if len(pts) < 3 or poly_area(pts) < 1e-4:
                continue
            light = (i + j) % 2 == 0
            floor_poly(M, pts, 0.0, "CS_GlossMarbleLight" if light else "CS_GlossMarbleDark")
            # a gilded vein across some of them: from one edge to another, wandering a little
            if rnd.random() < 0.4 and poly_area(pts) > d1 * d2 / 2 * 0.9:
                e0 = rnd.randrange(4)
                e1 = (e0 + 2) % 4 if rnd.random() < 0.6 else (e0 + 1) % 4
                t0, t1 = rnd.uniform(0.25, 0.75), rnd.uniform(0.25, 0.75)
                pa = tuple(diamond[e0][k] + (diamond[(e0 + 1) % 4][k] - diamond[e0][k]) * t0 for k in range(2))
                pb = tuple(diamond[e1][k] + (diamond[(e1 + 1) % 4][k] - diamond[e1][k]) * t1 for k in range(2))
                steps = 7
                path = []
                for k in range(steps + 1):
                    t = k / steps
                    wob = math.sin(t * math.pi * 2.3 + rnd.random()) * 0.04 * math.sin(t * math.pi)
                    px = pa[0] + (pb[0] - pa[0]) * t
                    pz = pa[1] + (pb[1] - pa[1]) * t
                    nx, nz = -(pb[1] - pa[1]), pb[0] - pa[0]
                    ln = math.hypot(nx, nz) or 1
                    path.append((px + nx / ln * wob, pz + nz / ln * wob))
                w = 0.007 + rnd.random() * 0.006
                for (ax, az), (bx_, bz_) in zip(path, path[1:]):
                    nx, nz = -(bz_ - az), bx_ - ax
                    ln = math.hypot(nx, nz) or 1
                    nx, nz = nx / ln * w, nz / ln * w
                    quad = clip_rect([(ax - nx, az - nz), (bx_ - nx, bz_ - nz), (bx_ + nx, bz_ + nz), (ax + nx, az + nz)], fx0, fx1, fz0, fz1)
                    floor_poly(M, quad, 0.0012, "CS_Vein")
    ru = L["runner"]
    rw = ru["w"] / 2
    box(M, ru["x"] - rw, ru["x"] + rw, 0.0, 0.004, -h + 0.2, ru["z1"], "CS_Runner")
    for sx in (-1, 1):
        xx = ru["x"] + sx * rw
        box(M, min(xx, xx - sx * 0.07), max(xx, xx - sx * 0.07), 0.004, 0.008, -h + 0.2, ru["z1"], "CS_Inlay")
    frame_strips(M, fx0, fx1, fz0, fz1, 0.08, 0.0, INLAY, "CS_Inlay")

    # 3 Neon Alley: polished obsidian tiles (the neon shines back off them: neon_reflection), a
    # cyan neon strip just inside its open edge
    tile, grout = 0.56, 0.018
    ax0, ax1, az0, az1 = a["x0"], a["x1"], a["z0"], a["z1"]
    nx_ = int(math.ceil((ax1 - ax0) / tile))
    nz_ = int(math.ceil((az1 - az0) / tile))
    for i in range(nx_):
        for j in range(nz_):
            tx0 = ax1 - (i + 1) * tile + grout / 2
            tx1 = ax1 - i * tile - grout / 2
            tz0 = az0 + j * tile + grout / 2
            tz1 = az0 + (j + 1) * tile - grout / 2
            mat = "CS_Obsidian" if (i + j) % 2 == 0 else "CS_ObsidianLight"
            # each tile in 4 x 4, so the painted reflections have somewhere to be
            for u in range(4):
                for v in range(4):
                    q = clip_rect([(tx0 + (tx1 - tx0) * u / 4, tz0 + (tz1 - tz0) * v / 4), (tx0 + (tx1 - tx0) * (u + 1) / 4, tz0 + (tz1 - tz0) * v / 4), (tx0 + (tx1 - tx0) * (u + 1) / 4, tz0 + (tz1 - tz0) * (v + 1) / 4), (tx0 + (tx1 - tx0) * u / 4, tz0 + (tz1 - tz0) * (v + 1) / 4)], ax0, ax1, az0, az1)
                    floor_poly(M, q, 0.0, mat)
    # the grout between them (a floor of its own, a hair under the tiles)
    floor_poly(M, [(ax0, az0), (ax1, az0), (ax1, az1), (ax0, az1)], -0.0015, "CS_Grout")
    box(M, a["x1"] - 0.11, a["x1"] - 0.05, 0.0, 0.006, a["z0"] + 0.1, a["z1"] - 0.1, "CS_NeonCyan")


def divider(M, a, b):
    """A brass divider strip where two floors meet, along a line from (x, z) a to b: a 20 mm bevel
    (60 mm at its foot, 30 mm on top)."""
    (ax, az), (bx, bz) = a, b
    if abs(ax - bx) < 1e-6:
        vslab(M, [(ax - 0.03, 0.0), (ax + 0.03, 0.0), (ax + 0.015, 0.02), (ax - 0.015, 0.02)], min(az, bz), max(az, bz), "CS_Brass")
    else:
        xslab(M, [(az - 0.03, 0.0), (az + 0.03, 0.0), (az + 0.015, 0.02), (az - 0.015, 0.02)], min(ax, bx), max(ax, bx), "CS_Brass")


def build_dividers(M, L):
    face = wall_face(L)
    f = zone(L, "foyer")
    divider(M, (f["x0"], f["z1"]), (L["half"], f["z1"]))
    a = zone(L, "alley")
    divider(M, (a["x1"], a["z0"]), (a["x1"], a["z1"]))
    divider(M, (face, a["z0"]), (a["x1"], a["z0"]))


# ---------------------------------------------------------------------------------------------
# the stages: the High-Roller Pit and the Velvet Lounge, raised, with their steps


def tread_boxes(s, k):
    """The (x0, x1, z0, z1) boxes of tread `k` (0: against the stage): the ring `depth / count`
    wide, `k` rings out, round the stage's open runs (a corner between two open runs is stepped
    too; it belongs to the x edge's run)."""
    t = s["depth"] / s["count"]
    a, b = k * t, (k + 1) * t

    def has(edge, v):
        return any(o["edge"] == edge and min(o["from"], o["to"]) - 1e-6 <= v <= max(o["from"], o["to"]) + 1e-6 for o in s["open"])

    out = []
    for o in s["open"]:
        lo, hi = min(o["from"], o["to"]), max(o["from"], o["to"])
        e = o["edge"]
        if e in ("x0", "x1"):
            zlo, zhi = lo, hi
            corner_lo = abs(lo - s["z0"]) < 1e-6 and has("z0", s[e])
            corner_hi = abs(hi - s["z1"]) < 1e-6 and has("z1", s[e])
            if corner_lo:
                zlo = s["z0"] - b
            if corner_hi:
                zhi = s["z1"] + b
            xa, xb = (s["x1"] + a, s["x1"] + b) if e == "x1" else (s["x0"] - b, s["x0"] - a)
            out.append({"box": (xa, xb, zlo, zhi), "edge": e, "corners": (corner_lo, corner_hi)})
        else:
            xlo, xhi = lo, hi
            if abs(lo - s["x0"]) < 1e-6 and has("x0", s[e]):
                xlo = s["x0"] - a
            if abs(hi - s["x1"]) < 1e-6 and has("x1", s[e]):
                xhi = s["x1"] + a
            za, zb = (s["z1"] + a, s["z1"] + b) if e == "z1" else (s["z0"] - b, s["z0"] - a)
            out.append({"box": (xlo, xhi, za, zb), "edge": e, "corners": (False, False)})
    return out


def herringbone(M, x0, x1, z0, z1, y):
    """Dark oak herringbone parquet over a rectangle at height y: planks W wide and L = 5W long,
    laid in zig-zag runs along (1, 1) (the camera's up-and-down: the spines stand upright on the
    screen), three tones of oak, clipped at the edges."""
    import random

    rnd = random.Random(11)
    Wp = 0.11
    Lp = Wp * 5
    tones = ("CS_Oak", "CS_OakDark", "CS_OakLight", "CS_Oak")
    span = (x1 - x0) + (z1 - z0)
    kmax = int(span / Wp) + 12
    mmax = int(span / Lp) + 4
    for m in range(-mmax, mmax + 1):
        for k in range(-kmax, kmax + 1):
            ox = x0 + k * Wp + m * Lp
            oz = z0 + k * Wp - m * Lp
            for rx0, rx1, rz0, rz1 in ((ox, ox + Lp, oz, oz + Wp), (ox, ox + Wp, oz + Wp, oz + Wp + Lp)):
                if rx1 < x0 or rx0 > x1 or rz1 < z0 or rz0 > z1:
                    continue
                q = clip_rect([(rx0, rz0), (rx1, rz0), (rx1, rz1), (rx0, rz1)], x0, x1, z0, z1)
                if len(q) >= 3 and poly_area(q) > 1e-5:
                    floor_poly(M, q, y, tones[rnd.randrange(len(tones))])


def build_stages(M, L):
    face = wall_face(L)
    for s in L["stages"]:
        h = s["h"]
        pit = s["id"] == "pit"
        top_mat = "CS_PitCarpet" if pit else "CS_Oak"
        trim = "CS_Brass" if pit else "CS_MahoganyDark"
        x0, z0 = max(s["x0"], face), max(s["z0"], face)
        x1, z1 = s["x1"], min(s["z1"], L["half"])
        # the block, and its top: emerald carpet, or dark oak herringbone parquet
        if pit:
            box(M, x0, x1, 0.0, h - 0.03, z0, z1, "CS_Mahogany")
            box(M, x0, x1, h - 0.03, h, z0, z1, "CS_PitCarpet")
        else:
            box(M, x0, x1, 0.0, h - 0.002, z0, z1, "CS_Mahogany")
            herringbone(M, x0, x1, z0, z1, h)
        # the edge trim along every side that faces the room: a nosing proud of the edge, a gold line under it
        room_edges = [e for e in ("x1", "z1", "z0", "x0") if not (e == "z0" and z0 <= face + 1e-6) and not (e == "x0" and x0 <= face + 1e-6)]
        for e in room_edges:
            if e == "x0":
                box(M, x0 - 0.03, x0 + 0.02, h - 0.05, h + 0.008, z0, z1, trim)
            elif e == "x1":
                box(M, x1 - 0.02, x1 + 0.03, h - 0.05, h + 0.008, z0, z1, trim)
                if not pit:
                    box(M, x1, x1 + 0.035, h - 0.075, h - 0.05, z0, z1, "CS_Gold")
            elif e == "z1":
                box(M, x0, x1 + 0.03, h - 0.05, h + 0.008, z1 - 0.02, z1 + (0.0 if z1 >= L["half"] - 1e-6 else 0.03), trim)
                if not pit and z1 < L["half"] - 1e-6:
                    box(M, x0, x1, h - 0.075, h - 0.05, z1, z1 + 0.035, "CS_Gold")
            else:
                box(M, x0, x1 + 0.03, h - 0.05, h + 0.008, z0 - 0.03, z0 + 0.02, trim)
                if not pit:
                    box(M, x0, x1, h - 0.075, h - 0.05, z0 - 0.035, z0, "CS_Gold")
        # the steps: `count` treads round the open runs, each riser the same, nosed like the edge
        for k in range(s["count"]):
            th = h * (s["count"] - k) / (s["count"] + 1)
            for t in tread_boxes(s, k):
                bx0, bx1, bz0, bz1 = t["box"]
                bx0, bz0 = max(bx0, face), max(bz0, face)
                bz1 = min(bz1, L["half"])
                box(M, bx0, bx1, 0.0, th - 0.02, bz0, bz1, "CS_Mahogany")
                box(M, bx0, bx1, th - 0.02, th, bz0, bz1, top_mat)
                # the nosing along the tread's outer edge (and round the corner it turns)
                e = t["edge"]
                if e == "x1":
                    box(M, bx1 - 0.03, bx1 + 0.012, th - 0.035, th + 0.006, bz0, bz1, trim)
                    if t["corners"][1]:
                        box(M, bx0, bx1 + 0.012, th - 0.035, th + 0.006, bz1 - 0.03, bz1 + 0.012, trim)
                    if t["corners"][0]:
                        box(M, bx0, bx1 + 0.012, th - 0.035, th + 0.006, bz0 - 0.012, bz0 + 0.03, trim)
                elif e == "x0":
                    box(M, bx0 - 0.012, bx0 + 0.03, th - 0.035, th + 0.006, bz0, bz1, trim)
                elif e == "z1":
                    box(M, bx0, bx1, th - 0.035, th + 0.006, bz1 - 0.03, bz1 + 0.012, trim)
                else:
                    box(M, bx0, bx1, th - 0.035, th + 0.006, bz0 - 0.012, bz0 + 0.03, trim)
        # a run of steps that ends short of the stage's corner ends in a brass-capped cheek (the
        # colliders' stepCheeks): you go up the steps, not over their ends
        for o in s["open"]:
            horizontal = o["edge"] in ("z0", "z1")
            lo_c, hi_c = (s["x0"], s["x1"]) if horizontal else (s["z0"], s["z1"])
            base = s[o["edge"]]
            sign = 1 if o["edge"] in ("x1", "z1") else -1
            a_, b_ = sorted((base, base + sign * s["depth"]))
            for end in (min(o["from"], o["to"]), max(o["from"], o["to"])):
                if end <= lo_c + 1e-6 or end >= hi_c - 1e-6:
                    continue
                if horizontal:
                    box(M, end - 0.08, end + 0.08, 0.0, h + 0.08, a_, b_, "CS_Mahogany")
                    box(M, end - 0.09, end + 0.09, h + 0.08, h + 0.12, a_ - 0.01, b_ + 0.01, "CS_Brass")
                    blob(M, end, h + 0.17, base + sign * s["depth"], 0.05, 0.05, 0.05, "CS_Brass", cuts=2)
                else:
                    box(M, a_, b_, 0.0, h + 0.08, end - 0.08, end + 0.08, "CS_Mahogany")
                    box(M, a_ - 0.01, b_ + 0.01, h + 0.08, h + 0.12, end - 0.09, end + 0.09, "CS_Brass")
                    blob(M, base + sign * s["depth"], h + 0.17, end, 0.05, 0.05, 0.05, "CS_Brass", cuts=2)


# ---------------------------------------------------------------------------------------------
# the walls: a two-tier wainscot (dark fluted walnut to 1.2 above the floor, a gilt chair rail),
# burgundy velvet wallpaper in gold damask above it, a gold crown and cornice, fluted pilasters,
# Art-Deco twin-beam sconces every three metres or so (their beams painted up and down the walls:
# wall_lights), the doors


def wall_runs(L):
    """Each wall's stretches between its doors, and the floor's height along them: (wall, u0, u1,
    floor), u along the wall (x on the back wall, z on the left one)."""
    h = L["half"]
    face = wall_face(L)
    d = L["doors"]
    vd = L["vipDoors"]
    lounge = stage(L, "lounge")
    pit = stage(L, "pit")
    vx0, vx1 = vd["x"] - vd["w"] / 2, vd["x"] + vd["w"] / 2
    dx0, dx1 = d["x"] - d["w"] / 2, d["x"] + d["w"] / 2
    return [
        ("z", face, lounge["x1"], lounge["h"]),
        ("z", lounge["x1"], vx0 - 0.3, pit["h"]),
        ("z", vx1 + 0.3, pit["x1"], pit["h"]),
        ("z", pit["x1"], dx0 - 0.15, 0.0),
        ("z", dx1 + 0.15, h, 0.0),
        ("x", face, lounge["z1"], lounge["h"]),
        ("x", lounge["z1"], h, 0.0),
    ]


def wall_quad(M, L, wall, u0, u1, v0, v1, d, mat):
    """A flat rectangle on a wall (u along it, v up), `d` out of it, facing into the room."""
    face = wall_face(L)
    if wall == "z":
        flat(M, [(u0, v0, face + d), (u1, v0, face + d), (u1, v1, face + d), (u0, v1, face + d)], mat, (0.0, 0.0, 1.0))
    else:
        flat(M, [(face + d, v0, u0), (face + d, v0, u1), (face + d, v1, u1), (face + d, v1, u0)], mat, (1.0, 0.0, 0.0))


def wall_box(M, L, wall, u0, u1, v0, v1, d0, d1, mat):
    face = wall_face(L)
    if wall == "z":
        box(M, u0, u1, v0, v1, face + d0, face + d1, mat)
    else:
        box(M, face + d0, face + d1, v0, v1, u0, u1, mat)


def wall_blocked(L, wall, u, v):
    """Whether a spot on a wall is hidden behind something standing against it (no damask there)."""
    for w, u0, u1, v0, v1 in WALL_FEATURES:
        if w == wall and u0 <= u <= u1 and v0 <= v <= v1:
            return True
    return False


WALL_FEATURES = []


def build_walls(M, L):
    h = L["half"]
    t = L["walls"]["t"]
    top = L["walls"]["h"]
    face = wall_face(L)
    d = L["doors"]
    dx0, dx1 = d["x"] - d["w"] / 2, d["x"] + d["w"] / 2

    # the masonry, its room face a hair behind the wallpaper; open for the penthouse's doors up on
    # the stage (their recess and frame: build_vip_doors)
    vd = L["vipDoors"]
    vx0, vx1 = vd["x"] - vd["w"] / 2, vd["x"] + vd["w"] / 2
    vtop = stage(L, "pit")["h"] + vd["h"]
    back = face - 0.004
    box(M, -h, vx0, 0.0, top, -h, back, "CS_Wall")
    box(M, vx1, h, 0.0, top, -h, back, "CS_Wall")
    box(M, vx0, vx1, vtop, top, -h, back, "CS_Wall")
    box(M, -h, back, 0.0, top, back, h, "CS_Wall")

    crown = top - 0.25
    for wall, u0, u1, fl in wall_runs(L):
        rail = fl + 1.2
        # the wainscot: a walnut skirting, the panel, its reeds, a gilt chair rail and a walnut cap
        wall_box(M, L, wall, u0, u1, 0.0, fl + 0.13, 0.0, 0.07, "CS_WalnutDark")
        wall_box(M, L, wall, u0, u1, fl + 0.13, rail, 0.0, 0.035, "CS_WalnutDark")
        u = u0 + 0.06
        while u < u1 - 0.05:
            wall_box(M, L, wall, u, min(u + 0.05, u1 - 0.02), fl + 0.19, rail - 0.1, 0.035, 0.048, "CS_Walnut")
            u += 0.085
        wall_box(M, L, wall, u0, u1, fl + 0.13, fl + 0.17, 0.0, 0.05, "CS_Walnut")
        wall_box(M, L, wall, u0, u1, rail - 0.1, rail - 0.04, 0.0, 0.05, "CS_Walnut")
        wall_box(M, L, wall, u0, u1, rail - 0.04, rail + 0.02, 0.0, 0.075, "CS_Gold")
        wall_box(M, L, wall, u0, u1, rail + 0.02, rail + 0.05, 0.0, 0.06, "CS_Walnut")
        # the wallpaper: burgundy velvet in a fine grid (so the sconces' light has somewhere to
        # fall), and gold damask on it in a half-drop repeat
        v0 = rail + 0.05
        nu = max(1, int(math.ceil((u1 - u0) / 0.2)))
        nv = max(1, int(math.ceil((crown - v0) / 0.2)))
        for i in range(nu):
            for j in range(nv):
                wall_quad(M, L, wall, u0 + (u1 - u0) * i / nu, u0 + (u1 - u0) * (i + 1) / nu, v0 + (crown - v0) * j / nv, v0 + (crown - v0) * (j + 1) / nv, 0.0, "CS_Wallpaper")
        su, sv = 0.66, 0.74
        size = 0.56
        col = int(math.floor((u0 + 50) / su))
        uu = (col + 0.5) * su - 50
        while uu < u1:
            vv = v0 + sv / 2 + (sv / 2 if col % 2 else 0.0) - sv
            while vv < crown:
                if u0 + size * 0.45 < uu < u1 - size * 0.45 and v0 + size * 0.5 < vv < crown - size * 0.5 and not wall_blocked(L, wall, uu, vv):
                    if wall == "z":
                        place = lambda uv, uu=uu, vv=vv: (0.0, 0.0, 1.0) if uv is None else (uu + uv[0], vv + uv[1], face + DAMASK)
                    else:
                        place = lambda uv, uu=uu, vv=vv: (1.0, 0.0, 0.0) if uv is None else (face + DAMASK, vv + uv[1], uu - uv[0])
                    lay_damask(M, place, size, "CS_WallDamask", "CS_WallDamask")
                vv += sv
            uu += su
            col += 1
    # the crown: a gold band and a walnut cornice, along both walls
    box(M, face, h, crown, crown + 0.1, face, face + 0.06, "CS_Gold")
    box(M, face, h, crown + 0.1, top, face, face + 0.12, "CS_Walnut")
    box(M, face, face + 0.06, crown, crown + 0.1, face + 0.06, h, "CS_Gold")
    box(M, face, face + 0.12, crown + 0.1, top, face + 0.12, h, "CS_Walnut")
    for k in range(3):
        box(M, face, h, crown + 0.1 + k * 0.05, crown + 0.12 + k * 0.05, face + 0.12, face + 0.13 + k * 0.012, "CS_WalnutDark")
        box(M, face + 0.12, face + 0.13 + k * 0.012, crown + 0.1 + k * 0.05, crown + 0.12 + k * 0.05, face + 0.13, h, "CS_WalnutDark")

    # fluted walnut pilasters where the walls' floors change, and between the rooms
    def pilaster(wall, u, fl):
        wall_box(M, L, wall, u - 0.15, u + 0.15, fl + 1.2, crown, 0.0, 0.08, "CS_Walnut")
        for k in (-1, 0, 1):
            wall_box(M, L, wall, u + k * 0.08 - 0.012, u + k * 0.08 + 0.012, fl + 1.36, crown - 0.2, 0.08, 0.09, "CS_Gold")
        wall_box(M, L, wall, u - 0.19, u + 0.19, crown - 0.2, crown, 0.0, 0.11, "CS_Gold")
        wall_box(M, L, wall, u - 0.19, u + 0.19, fl + 1.2, fl + 1.3, 0.0, 0.1, "CS_Gold")

    lounge = stage(L, "lounge")
    pit = stage(L, "pit")
    for x, fl in ((lounge["x1"], pit["h"]), (-1.2, pit["h"]), (pit["x1"], 0.0), (7.97, 0.0)):
        pilaster("z", x, fl)
    for z, fl in ((-4.05, lounge["h"]), (lounge["z1"], lounge["h"]), (8.3, 0.0)):
        pilaster("x", z, fl)

    # the Art-Deco twin-beam sconces (on a pilaster's face where one stands): a stepped brass back
    # plate, a fluted stem, a frosted glass tulip opening up and another down, gilt collars (their
    # light: wall_lights)
    y = L["sconces"]["y"]
    piers = [("z", x) for x in (lounge["x1"], -1.2, pit["x1"], 7.97)] + [("x", z) for z in (-4.05, lounge["z1"], 8.3)]
    for wall, key in (("z", "onBackZ"), ("x", "onBackX")):
        for u in L["sconces"][key]:
            fl = floor_y(L, u, face + 0.3) if wall == "z" else floor_y(L, face + 0.3, u)
            sy = y + fl
            d0 = 0.09 if any(w == wall and abs(q - u) < 0.2 for w, q in piers) else 0.0
            for k, (hw, hv) in enumerate(((0.1, 0.22), (0.075, 0.28), (0.05, 0.34))):
                wall_box(M, L, wall, u - hw, u + hw, sy - hv, sy + hv, d0, d0 + 0.015 + k * 0.012, "CS_Brass" if k != 1 else "CS_Gold")
            wall_box(M, L, wall, u - 0.018, u + 0.018, sy - 0.16, sy + 0.16, d0 + 0.04, d0 + 0.09, "CS_Gold")
            for sign in (1, -1):
                c0 = sy + sign * 0.14
                wall_box(M, L, wall, u - 0.05, u + 0.05, min(c0, c0 + sign * 0.03), max(c0, c0 + sign * 0.03), d0 + 0.03, d0 + 0.13, "CS_Gold")
                for j in range(4):
                    r1 = 0.035 + j * 0.018
                    a_, b_ = c0 + sign * (0.03 + j * 0.035), c0 + sign * (0.03 + (j + 1) * 0.035)
                    wall_box(M, L, wall, u - r1, u + r1, min(a_, b_), max(a_, b_), d0 + 0.08 - r1, d0 + 0.08 + r1, "CS_Bulb")

    # the grand double doors: a gold frame, mahogany leaves with gold fluting and brass pulls, and a
    # glowing fan transom above them
    face_z = face
    dh = d["h"]
    box(M, dx0 - 0.15, dx0, 0.0, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    box(M, dx1, dx1 + 0.15, 0.0, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    box(M, dx0 - 0.15, dx1 + 0.15, dh, dh + 0.12, face_z, face_z + 0.1, "CS_Gold")
    mid = d["x"]
    for a, b in ((dx0, mid - 0.01), (mid + 0.01, dx1)):
        box(M, a, b, 0.0, dh, face_z - 0.004, face_z + 0.06, "CS_Mahogany")
        w = b - a
        for k in (0.25, 0.5, 0.75):
            xk = a + w * k
            box(M, xk - 0.015, xk + 0.015, 0.3, dh - 0.3, face_z + 0.06, face_z + 0.07, "CS_Gold")
        box(M, a + 0.12, b - 0.12, 1.42, 1.48, face_z + 0.06, face_z + 0.07, "CS_Gold")
    for x in (mid - 0.1, mid + 0.1):
        cylinder(M, (x, 1.05, face_z + 0.07), (x, 1.05, face_z + 0.14), 0.035, "CS_Brass", sides=10)
        cylinder(M, (x, 0.85, face_z + 0.14), (x, 1.25, face_z + 0.14), 0.022, "CS_Brass", sides=8)
    cy = dh + 0.12
    r_in, r_out = 0.12, 0.72
    wedges = 7
    for k in range(wedges):
        a0 = math.pi * k / wedges + 0.02
        a1 = math.pi * (k + 1) / wedges - 0.02
        pts = [(mid + r_in * math.cos(a0), cy + r_in * math.sin(a0)), (mid + r_out * math.cos(a0), cy + r_out * math.sin(a0)), (mid + r_out * math.cos(a1), cy + r_out * math.sin(a1)), (mid + r_in * math.cos(a1), cy + r_in * math.sin(a1))]
        vslab(M, list(reversed(pts)), face_z, face_z + 0.05, "CS_Bulb")
    arc_o = [(mid + 0.82 * math.cos(math.pi * k / 16), cy + 0.82 * math.sin(math.pi * k / 16)) for k in range(17)]
    arc_i = [(mid + r_out * math.cos(math.pi * k / 16), cy + r_out * math.sin(math.pi * k / 16)) for k in range(17)]
    for k in range(16):
        vslab(M, [arc_i[k], arc_o[k], arc_o[k + 1], arc_i[k + 1]], face_z, face_z + 0.08, "CS_Gold")
    vslab(M, [(mid + r_in * math.cos(math.pi * k / 10), cy + r_in * math.sin(math.pi * k / 10)) for k in range(11)], face_z, face_z + 0.08, "CS_Gold")


def build_marquee(M, L, nodes):
    """The Big-Win marquee over the main floor: a black board in a gold frame under a stepped crest,
    a row of bulbs round it; its screen is a node of its own (the game paints the news on it)."""
    m = L["marquee"]
    face = wall_face(L)
    x0, x1 = m["x"] - m["w"] / 2, m["x"] + m["w"] / 2
    y0, y1 = m["y"] - m["h"] / 2, m["y"] + m["h"] / 2
    box(M, x0, x1, y0, y1, face, face + 0.06, "CS_Black")
    for a, b, c, d in ((x0, x1, y0, y0 + 0.06), (x0, x1, y1 - 0.06, y1), (x0, x0 + 0.06, y0 + 0.06, y1 - 0.06), (x1 - 0.06, x1, y0 + 0.06, y1 - 0.06)):
        box(M, a, b, c, d, face + 0.06, face + 0.1, "CS_Gold")
    # the crest: three gold tiers and a glowing fan over them
    mid = m["x"]
    for k, w in enumerate((1.1, 0.75, 0.4)):
        box(M, mid - w / 2, mid + w / 2, y1 + k * 0.07, y1 + (k + 1) * 0.07, face, face + 0.08 - k * 0.01, "CS_Gold" if k != 1 else "CS_Black")
    cyc = y1 + 0.21
    for k in range(5):
        a0 = math.pi * k / 5 + 0.04
        a1 = math.pi * (k + 1) / 5 - 0.04
        vslab(M, [(mid + 0.05 * math.cos(a0), cyc + 0.05 * math.sin(a0)), (mid + 0.2 * math.cos(a0), cyc + 0.2 * math.sin(a0)), (mid + 0.2 * math.cos(a1), cyc + 0.2 * math.sin(a1)), (mid + 0.05 * math.cos(a1), cyc + 0.05 * math.sin(a1))], face, face + 0.04, "CS_Bulb")
    # bulbs round the frame
    n = int((x1 - x0) / 0.15)
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        for yy in (y0 - 0.02, y1 + 0.02):
            if yy > y1 and abs(x - mid) < 0.58:
                continue
            blob(M, x, yy, face + 0.07, 0.022, 0.022, 0.022, "CS_Bulb", cuts=1)
    for k in range(1, 5):
        yy = y0 + (y1 - y0) * k / 5
        for x in (x0 - 0.02, x1 + 0.02):
            blob(M, x, yy, face + 0.07, 0.022, 0.022, 0.022, "CS_Bulb", cuts=1)
    # the screen: a quad just proud of the board, UV mapped across it
    S = Mesh()
    bm = S.bm
    uv = bm.loops.layers.uv.new("UVMap")
    sx0, sx1, sy0, sy1, sz = x0 + 0.08, x1 - 0.08, y0 + 0.08, y1 - 0.08, face + 0.065
    vs = [bm.verts.new(W(sx0, sy0, sz)), bm.verts.new(W(sx1, sy0, sz)), bm.verts.new(W(sx1, sy1, sz)), bm.verts.new(W(sx0, sy1, sz))]
    fc = bm.faces.new(vs)
    fc.material_index = S.m("CS_Screen")
    for loop, uvv in zip(fc.loops, ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))):
        loop[uv].uv = uvv
    nodes.append({"name": "Prop_Marquee", "mesh": S, "origin": (mid, (sy0 + sy1) / 2, sz), "coloured": False, "recalc": False})


def build_frame(M, L, wall, at, yc, w, h, canvas, slim=False, light=True):
    """A Baroque gold-leaf frame on a wall round a dark canvas (a sight edge, a gilt ogee, a brass
    bead, the outer moulding, carved corners, a shell crest; a slim gilt frame for a poster), and a
    brass picture light over it (its light: wall_lights). Returns the canvas's depth."""
    wbox(M, L, wall, at, -w / 2, w / 2, yc - h / 2, yc + h / 2, 0.0, 0.03, canvas)
    W2, H2 = w / 2, h / 2

    def ring(i, o, d, mat):
        wbox(M, L, wall, at, -W2 - o, W2 + o, yc + H2 + i, yc + H2 + o, 0.0, d, mat)
        wbox(M, L, wall, at, -W2 - o, W2 + o, yc - H2 - o, yc - H2 - i, 0.0, d, mat)
        wbox(M, L, wall, at, -W2 - o, -W2 - i, yc - H2 - i, yc + H2 + i, 0.0, d, mat)
        wbox(M, L, wall, at, W2 + i, W2 + o, yc - H2 - i, yc + H2 + i, 0.0, d, mat)

    if slim:
        ring(0.0, 0.015, 0.04, "CS_Black")
        ring(0.015, 0.045, 0.055, "CS_Gold")
        top = yc + H2 + 0.045
    else:
        ring(0.0, 0.02, 0.045, "CS_MahoganyDark")
        ring(0.02, 0.05, 0.07, "CS_Gold")
        ring(0.05, 0.065, 0.085, "CS_Brass")
        ring(0.065, 0.11, 0.06, "CS_Gold")
        for su in (-1, 1):
            for sv in (-1, 1):
                wblob(M, L, wall, at, su * (W2 + 0.075), yc + sv * (H2 + 0.075), 0.08, 0.06, 0.06, 0.028, "CS_Gold", cuts=2)
                wblob(M, L, wall, at, su * (W2 + 0.02), yc + sv * (H2 + 0.11), 0.06, 0.04, 0.02, 0.015, "CS_Gold", cuts=1)
        # the crest: a scallop shell of gilt ribs over two scrolls
        cy = yc + H2 + 0.1
        for k in range(7):
            a0 = math.pi * (0.08 + 0.84 * k / 7)
            a1 = math.pi * (0.08 + 0.84 * (k + 1) / 7) - 0.03
            wshape(M, L, wall, at, [(0.02 * math.cos((a0 + a1) / 2), cy), (0.15 * math.cos(a0), cy + 0.15 * math.sin(a0)), (0.15 * math.cos(a1), cy + 0.15 * math.sin(a1))], 0.0, 0.05, "CS_Gold")
        for su in (-1, 1):
            wblob(M, L, wall, at, su * 0.13, cy + 0.01, 0.05, 0.05, 0.03, 0.02, "CS_Gold", cuts=2)
        wbox(M, L, wall, at, -0.13, 0.13, yc - H2 - 0.1, yc - H2 - 0.04, 0.06, 0.075, "CS_Brass")  # the name plate
        top = cy + 0.15
    if not light:
        return 0.03
    # the picture light: a brass arm off the wall, a bar lamp, its glowing lip
    ly = top + 0.12
    wbar(M, L, wall, at, (0.0, ly - 0.08), (0.0, ly), 0.02, 0.012, "CS_Brass", sides=6)
    wbox(M, L, wall, at, -0.03, 0.03, ly - 0.02, ly + 0.02, 0.0, 0.16, "CS_Brass")
    wbar(M, L, wall, at, (-w * 0.33, ly), (w * 0.33, ly), 0.17, 0.028, "CS_Brass", sides=10)
    wbox(M, L, wall, at, -w * 0.32, w * 0.32, ly - 0.035, ly - 0.022, 0.15, 0.19, "CS_Bulb")
    return 0.03


def clip_uv(pts, w, h, yc):
    """(u, v) points clipped to a canvas w by h centred at (0, yc)."""
    return clip_rect(pts, -w / 2, w / 2, yc - h / 2, yc + h / 2)


def build_poster(M, L, p):
    """A 1920s Art-Deco casino poster in a slim gilt frame: the Turf Club's racer under a rising sun,
    a champagne coupe in a burst of bubbles, a roulette wheel, a pair of dice under a stepped arch."""
    wall, at, yc, design = p["wall"], p["at"], p["y"], p["design"]
    w, h = p.get("w", 0.6), p.get("h", 0.86)
    ground = {"derby": "CS_Canvas3", "champagne": "CS_Canvas2", "roulette": "CS_Black", "dice": "CS_Teal"}[design]
    d0 = build_frame(M, L, wall, at, yc, w, h, ground, slim=True, light=p.get("light", True))
    # the design is drawn for a 0.6 by 0.86 sheet: scaled to this one
    k = min(w / 0.6, h / 0.86)
    at_ = at
    layer = [d0]

    def shape(pts, mat):
        pts = [(u * k, yc + (v - yc) * k) for u, v in pts]
        q = clip_uv(pts, w - 0.02, h - 0.02, yc)
        if len(q) >= 3 and poly_area(q) > 1e-6:
            layer[0] += 0.0015
            wshape(M, L, wall, at, q, d0, layer[0] + 0.002, mat)

    def disc(cu, cv, r, mat, n=16):
        shape([(cu + r * math.cos(2 * math.pi * k / n), cv + r * math.sin(2 * math.pi * k / n)) for k in range(n)], mat)

    def rect(u0, u1, v0, v1, mat):
        shape([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat)

    # the title: a gold band and a thinner one under it, and a line of "type"
    rect(-0.22, 0.22, yc + 0.31, yc + 0.36, "CS_Gold")
    rect(-0.16, 0.16, yc + 0.275, yc + 0.29, "CS_Gold")
    if design == "derby":
        for k in range(9):
            a0 = math.pi * (0.06 + 0.88 * k / 9)
            a1 = a0 + math.pi * 0.88 / 18
            shape([(0.0, yc - 0.22), (0.7 * math.cos(a0), yc - 0.22 + 0.7 * math.sin(a0)), (0.7 * math.cos(a1), yc - 0.22 + 0.7 * math.sin(a1))], "CS_Gold")
        disc(0.0, yc - 0.22, 0.12, "CS_Amber")
        rect(-0.3, 0.3, yc - 0.43, yc - 0.22, "CS_Emerald")
        rect(-0.3, 0.3, yc - 0.235, yc - 0.215, "CS_Red")
        # the racer, mid-gallop, and its jockey
        cv = yc - 0.05
        shape([(-0.12 + 0.12 * math.cos(2 * math.pi * k / 14), cv + 0.055 * math.sin(2 * math.pi * k / 14)) for k in range(14)], "CS_Ivory")
        shape([(-0.02, cv + 0.03), (0.06, cv + 0.12), (0.1, cv + 0.1), (0.03, cv + 0.0)], "CS_Ivory")
        shape([(0.05, cv + 0.1), (0.13, cv + 0.12), (0.14, cv + 0.08), (0.08, cv + 0.07)], "CS_Ivory")
        for lu, lv, du in ((-0.2, cv - 0.02, -0.08), (-0.16, cv - 0.03, 0.02), (-0.06, cv - 0.03, -0.02), (-0.02, cv - 0.02, 0.09)):
            shape([(lu, lv), (lu + 0.02, lv), (lu + du + 0.02, lv - 0.12), (lu + du, lv - 0.12)], "CS_Ivory")
        shape([(-0.24, cv + 0.02), (-0.33, cv - 0.06), (-0.3, cv + 0.04)], "CS_Ivory")
        shape([(-0.07, cv + 0.05), (-0.02, cv + 0.05), (-0.03, cv + 0.12), (-0.07, cv + 0.11)], "CS_Red")
        disc(-0.05, cv + 0.14, 0.025, "CS_Red", n=8)
    elif design == "champagne":
        for k, r in enumerate((0.26, 0.21, 0.16)):
            ring_o = [(r * math.cos(math.pi * t / 12), yc - 0.02 + r * math.sin(math.pi * t / 12)) for t in range(13)]
            ring_i = [((r - 0.015) * math.cos(math.pi * t / 12), yc - 0.02 + (r - 0.015) * math.sin(math.pi * t / 12)) for t in range(12, -1, -1)]
            shape(ring_o + ring_i, "CS_Gold")
        bowl = [(0.13 * math.cos(math.pi + math.pi * t / 10), yc + 0.03 + 0.09 * math.sin(math.pi + math.pi * t / 10)) for t in range(11)]
        shape(bowl, "CS_Pearl")
        shape([(0.11 * math.cos(math.pi + math.pi * t / 10), yc + 0.025 + 0.07 * math.sin(math.pi + math.pi * t / 10)) for t in range(11)], "CS_Amber")
        rect(-0.008, 0.008, yc - 0.25, yc - 0.06, "CS_Pearl")
        shape([(0.07 * math.cos(2 * math.pi * k / 12), yc - 0.255 + 0.015 * math.sin(2 * math.pi * k / 12)) for k in range(12)], "CS_Pearl")
        for k in range(9):
            disc(-0.1 + 0.025 * k + 0.02 * math.sin(k * 2.1), yc + 0.08 + 0.04 * k, 0.008 + 0.004 * (k % 3), "CS_Pearl", n=8)
    elif design == "roulette":
        cv = yc + 0.0
        disc(0.0, cv, 0.22, "CS_Gold", n=24)
        for k in range(16):
            a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
            shape([(0.2 * math.cos(a0), cv + 0.2 * math.sin(a0)), (0.2 * math.cos(a1), cv + 0.2 * math.sin(a1)), (0.12 * math.cos(a1), cv + 0.12 * math.sin(a1)), (0.12 * math.cos(a0), cv + 0.12 * math.sin(a0))], "CS_Red" if k % 2 else "CS_MahoganyDark")
        disc(0.0, cv, 0.11, "CS_Mahogany", n=16)
        disc(0.0, cv, 0.035, "CS_Gold", n=10)
        for k in range(4):
            a = math.pi / 4 + math.pi / 2 * k
            shape([(0.01 * math.cos(a + 1.57), cv + 0.01 * math.sin(a + 1.57)), (0.1 * math.cos(a), cv + 0.1 * math.sin(a)), (0.01 * math.cos(a - 1.57), cv + 0.01 * math.sin(a - 1.57))], "CS_Gold")
        disc(0.17, cv + 0.02, 0.014, "CS_Ivory", n=8)
        rect(-0.3, 0.3, yc - 0.34, yc - 0.3, "CS_Red")
    else:  # dice
        for k in range(3):
            r = 0.26 - k * 0.05
            ring_o = [(r * math.cos(math.pi * t / 10), yc + 0.02 + r * math.sin(math.pi * t / 10)) for t in range(11)]
            ring_i = [((r - 0.012) * math.cos(math.pi * t / 10), yc + 0.02 + (r - 0.012) * math.sin(math.pi * t / 10)) for t in range(10, -1, -1)]
            shape(ring_o + ring_i, "CS_Gold")
        for cu, cv, ang, pips in ((-0.08, yc - 0.12, 0.25, [(-1, -1), (0, 0), (1, 1)]), (0.1, yc - 0.08, -0.2, [(-1, -1), (-1, 1), (1, -1), (1, 1), (0, 0)])):
            sz = 0.075
            corners = [(-sz, -sz), (sz, -sz), (sz, sz), (-sz, sz)]
            shape([(cu + a * math.cos(ang) - b * math.sin(ang), cv + a * math.sin(ang) + b * math.cos(ang)) for a, b in corners], "CS_Ivory")
            for pa, pb in pips:
                a, b = pa * 0.042, pb * 0.042
                disc(cu + a * math.cos(ang) - b * math.sin(ang), cv + a * math.sin(ang) + b * math.cos(ang), 0.012, "CS_Black", n=6)
        rect(-0.3, 0.3, yc - 0.3, yc - 0.27, "CS_Gold")


def build_portrait(M, L, p):
    """An ancestor of the house, in oils: a bust in low relief on a dark ground."""
    wall, at, yc, who = p["wall"], p["at"], p["y"], p["subject"]
    ground = {"fox": "CS_Canvas1", "bear": "CS_Canvas3", "owl": "CS_Canvas2", "poodle": "CS_Canvas1", "cat": "CS_Canvas2"}[who]
    d0 = build_frame(M, L, wall, at, yc, p.get("w", 0.9), p.get("h", 0.8), ground)

    def B(u, v, d, hu, hv, hd, mat, cuts=2):
        wblob(M, L, wall, at, u, yc + v, d0 + d, hu, hv, hd, mat, cuts=cuts)

    coat = {"fox": "CS_Suit", "bear": "CS_Black", "owl": "CS_Emerald", "poodle": "CS_ZaraPurple", "cat": "CS_Black"}[who]
    B(0.0, -0.24, 0.012, 0.26, 0.1, 0.02, coat)  # the shoulders
    if who in ("fox", "bear", "cat"):
        B(0.0, -0.2, 0.024, 0.06, 0.08, 0.012, "CS_Shirt")  # a shirt front
    if who == "fox":
        B(0.0, -0.13, 0.034, 0.035, 0.02, 0.01, "CS_Red", cuts=1)  # a cravat
        B(0.0, 0.02, 0.02, 0.12, 0.11, 0.025, "CS_FoxFur")
        B(0.0, -0.04, 0.036, 0.07, 0.045, 0.02, "CS_FoxWhite")
        for s in (-1, 1):
            B(s * 0.085, 0.14, 0.02, 0.04, 0.07, 0.015, "CS_FoxFur")
            B(s * 0.085, 0.13, 0.03, 0.02, 0.04, 0.008, "CS_FoxWhite", cuts=1)
            B(s * 0.045, 0.04, 0.042, 0.014, 0.014, 0.008, "CS_Eye", cuts=1)
        B(0.0, -0.02, 0.056, 0.018, 0.014, 0.01, "CS_Eye", cuts=1)
        B(0.045, 0.04, 0.05, 0.026, 0.026, 0.004, "CS_Gold", cuts=1)  # the monocle
    elif who == "bear":
        B(0.0, 0.02, 0.02, 0.13, 0.12, 0.028, "CS_BearFur")
        B(0.0, -0.04, 0.04, 0.06, 0.04, 0.02, "CS_Ivory")
        B(0.0, -0.025, 0.058, 0.02, 0.015, 0.01, "CS_Eye", cuts=1)
        for s in (-1, 1):
            B(s * 0.1, 0.12, 0.018, 0.04, 0.04, 0.015, "CS_BearFur")
            B(s * 0.045, 0.04, 0.042, 0.012, 0.012, 0.008, "CS_Eye", cuts=1)
        wbox(M, L, wall, at, -0.075, 0.075, yc + 0.13, yc + 0.3, d0, d0 + 0.03, "CS_Black")  # a top hat
        wbox(M, L, wall, at, -0.12, 0.12, yc + 0.12, yc + 0.145, d0, d0 + 0.035, "CS_Black")
        wbox(M, L, wall, at, -0.075, 0.075, yc + 0.15, yc + 0.175, d0, d0 + 0.034, "CS_Red")
        B(0.0, -0.13, 0.034, 0.045, 0.018, 0.008, "CS_Black", cuts=1)  # a bow tie
    elif who == "owl":
        B(0.0, -0.02, 0.02, 0.17, 0.2, 0.025, "CS_OwlBrown")
        B(0.0, 0.05, 0.036, 0.13, 0.1, 0.012, "CS_OwlLight")
        for s in (-1, 1):
            B(s * 0.055, 0.06, 0.048, 0.035, 0.035, 0.008, "CS_Amber", cuts=1)
            B(s * 0.055, 0.06, 0.055, 0.015, 0.015, 0.006, "CS_Eye", cuts=1)
            B(s * 0.1, 0.19, 0.02, 0.025, 0.05, 0.012, "CS_OwlBrown", cuts=1)  # the tufts
        B(0.0, 0.01, 0.052, 0.014, 0.025, 0.01, "CS_Gold", cuts=1)
        wbar(M, L, wall, at, (-0.1, yc + 0.06), (0.1, yc + 0.06), d0 + 0.058, 0.004, "CS_Gold", sides=5)  # spectacles' bridge
    elif who == "poodle":
        B(0.0, 0.02, 0.02, 0.11, 0.12, 0.025, "CS_PoodleCream")
        B(0.0, 0.16, 0.026, 0.1, 0.07, 0.02, "CS_PoodleCream")  # the topknot
        for s in (-1, 1):
            B(s * 0.12, -0.02, 0.02, 0.05, 0.1, 0.015, "CS_PoodleCream")  # the ears
            B(s * 0.04, 0.04, 0.042, 0.012, 0.012, 0.008, "CS_Eye", cuts=1)
        B(0.0, -0.04, 0.042, 0.05, 0.035, 0.015, "CS_Ivory")
        B(0.0, -0.03, 0.058, 0.014, 0.011, 0.008, "CS_Eye", cuts=1)
        for k in range(9):
            a = math.pi * (0.15 + 0.7 * k / 8)
            B(-0.13 * math.cos(a), -0.15 - 0.05 * math.sin(a), 0.034, 0.012, 0.012, 0.01, "CS_Pearl", cuts=1)  # pearls
    else:  # cat
        B(0.0, 0.01, 0.02, 0.12, 0.11, 0.025, "CS_CatBlack")
        B(0.0, -0.04, 0.036, 0.06, 0.04, 0.015, "CS_CatWhite")
        for s in (-1, 1):
            wshape(M, L, wall, at, [(s * 0.04, yc + 0.08), (s * 0.12, yc + 0.08), (s * 0.1, yc + 0.2)], d0 + 0.005, d0 + 0.03, "CS_CatBlack")  # the ears
            B(s * 0.045, 0.03, 0.042, 0.018, 0.014, 0.008, "CS_EyeGreen", cuts=1)
        B(0.0, -0.02, 0.05, 0.012, 0.009, 0.008, "CS_Rose", cuts=1)
        B(0.0, -0.13, 0.034, 0.05, 0.02, 0.008, "CS_Red", cuts=1)  # a bow tie


def build_mirror(M, L, p):
    """A gilded sunburst mirror: a round glass in a gold ring, sixteen rays, beads on the long ones."""
    wall, at, yc = p["wall"], p["at"], p["y"]
    for k in range(16):
        a = 2 * math.pi * k / 16 + math.pi / 16
        long = k % 2 == 0
        r1 = 0.6 if long else 0.47
        pts = [(0.33 * math.cos(a - 0.08), yc + 0.33 * math.sin(a - 0.08)), (r1 * math.cos(a), yc + r1 * math.sin(a)), (0.33 * math.cos(a + 0.08), yc + 0.33 * math.sin(a + 0.08))]
        wshape(M, L, wall, at, pts, 0.0, 0.025, "CS_Gold")
        if long:
            wblob(M, L, wall, at, (r1 + 0.03) * math.cos(a), yc + (r1 + 0.03) * math.sin(a), 0.02, 0.025, 0.025, 0.02, "CS_Gold", cuts=1)
    ring_o = [(0.36 * math.cos(2 * math.pi * k / 28), yc + 0.36 * math.sin(2 * math.pi * k / 28)) for k in range(28)]
    ring_i = [(0.29 * math.cos(2 * math.pi * k / 28), yc + 0.29 * math.sin(2 * math.pi * k / 28)) for k in range(28)]
    for k in range(28):
        j = (k + 1) % 28
        wshape(M, L, wall, at, [ring_i[k], ring_o[k], ring_o[j], ring_i[j]], 0.0, 0.05, "CS_Gold")
    wshape(M, L, wall, at, [(0.3 * math.cos(2 * math.pi * k / 28), yc + 0.3 * math.sin(2 * math.pi * k / 28)) for k in range(28)], 0.0, 0.035, "CS_Mirror")


def vip_leaf(D, hx, z, width, H, sign):
    """One of the penthouse's gilded door leaves, from its hinge at hx across `width` (toward +x when
    `sign` is 1): padded oxblood leather in a gold frame, a diamond lattice, a ring pull."""
    xa, xb = sorted((hx, hx + sign * width))
    box(D, xa, xb, 0.05, H, z - 0.03, z + 0.03, "CS_Leather")
    for y0, y1 in ((0.05, 0.1), (H - 0.05, H)):
        box(D, xa, xb, y0, y1, z - 0.035, z + 0.035, "CS_Gold")
    for xx in (xa, xb - 0.05):
        box(D, xx, xx + 0.05, 0.05, H, z - 0.035, z + 0.035, "CS_Gold")
    mid_y = (0.1 + H - 0.05) / 2
    for k in range(-2, 3):
        cx = (xa + xb) / 2 + k * 0.14
        for sgn in (-1, 1):
            a = (cx - 0.12, mid_y - sgn * 0.4)
            b = (cx + 0.12, mid_y + sgn * 0.4)
            if min(a[0], b[0]) < xa + 0.05 or max(a[0], b[0]) > xb - 0.05:
                continue
            cylinder(D, (a[0], a[1], z + 0.036), (b[0], b[1], z + 0.036), 0.007, "CS_Gold", sides=5)
    px = hx + sign * (width - 0.1)
    blob(D, px, mid_y, z + 0.05, 0.03, 0.03, 0.02, "CS_Gold", cuts=2)
    ring = [(px + 0.05 * math.cos(2 * math.pi * k / 10), mid_y - 0.07 + 0.05 * math.sin(2 * math.pi * k / 10), z + 0.06) for k in range(10)]
    for k in range(10):
        cylinder(D, ring[k], ring[(k + 1) % 10], 0.008, "CS_Gold", sides=5)


def loveseat(M, cx, cz, length, seat_top):
    """A little velvet loveseat against a wall, facing +z: bun feet, a deep seat, a rolled back and
    arms, gold buttons."""
    hl = length / 2
    front, back = cz + 0.35, cz - 0.4
    for fx in (cx - hl + 0.06, cx + hl - 0.06):
        for fz in (front - 0.06, back + 0.06):
            blob(M, fx, 0.035, fz, 0.035, 0.035, 0.035, "CS_Gold", cuts=1)
    box(M, cx - hl, cx + hl, 0.06, seat_top - 0.09, back, front, "CS_Velvet")
    blob(M, cx, seat_top - 0.045, cz + 0.08, hl - 0.1, 0.05, 0.25, "CS_Velvet", cuts=3, n=3.2)
    box(M, cx - hl, cx + hl, seat_top - 0.09, seat_top + 0.42, back, back + 0.2, "CS_Velvet")
    cylinder(M, (cx - hl, seat_top + 0.42, back + 0.1), (cx + hl, seat_top + 0.42, back + 0.1), 0.1, "CS_Velvet", sides=12)
    for sx in (-1, 1):
        box(M, cx + sx * hl - 0.14 if sx > 0 else cx - hl, cx + hl if sx > 0 else cx - hl + 0.14, seat_top - 0.09, seat_top + 0.16, back, front, "CS_Velvet")
        cylinder(M, (cx + sx * (hl - 0.07), seat_top + 0.16, back), (cx + sx * (hl - 0.07), seat_top + 0.16, front + 0.02), 0.09, "CS_Velvet", sides=12)
    for k in range(5):
        blob(M, cx - hl + 0.2 + k * (length - 0.4) / 4, seat_top + 0.25, back + 0.205, 0.012, 0.012, 0.006, "CS_Gold", cuts=1)


def build_vip_doors(M, L, nodes):
    """The Velvet Penthouse's doors in the High-Roller Stage's back wall (built on the stage): a
    gilded frame of fluted pilasters and a lintel of bulbs under an Art-Deco sunburst and a crown;
    two padded leather leaves (nodes: the game swings them open into the room for Bruno's guests),
    and behind them, in the wall's dark recess, the brass doors of the penthouse's elevator; a red
    runner out across the stage between two brass stanchions."""
    vd = L["vipDoors"]
    h = L["half"]
    face = -h + L["walls"]["t"]
    x, w, H = vd["x"], vd["w"], vd["h"]
    x0, x1 = x - w / 2, x + w / 2
    # the elevator in the recess (the wall is open here: build_walls leaves the gap)
    back = -h + 0.02
    box(M, x0, x1, 0.0, H, back - 0.02, back, "CS_Black")
    for a, b in ((x0 + 0.1, x - 0.01), (x + 0.01, x1 - 0.1)):
        box(M, a, b, 0.05, H - 0.35, back, back + 0.02, "CS_Brass")
        for k in range(4):
            yk = 0.35 + k * (H - 0.8) / 3
            box(M, a + 0.06, b - 0.06, yk, yk + 0.02, back + 0.02, back + 0.025, "CS_Gold")
    box(M, x0 + 0.1, x1 - 0.1, H - 0.35, H - 0.3, back, back + 0.03, "CS_Gold")
    blob(M, x, H - 0.18, back + 0.03, 0.07, 0.07, 0.02, "CS_Bulb", cuts=2)
    box(M, x0, x1, 0.0, 0.004, back, face, "CS_Runner")
    # the frame: fluted gold pilasters with brass capitals, a lintel set with bulbs
    for sx in (-1, 1):
        px = x + sx * (w / 2 + 0.09)
        box(M, px - 0.09, px + 0.09, 0.0, H, face, face + 0.12, "CS_Gold")
        for k in (-1, 0, 1):
            box(M, px + k * 0.05 - 0.01, px + k * 0.05 + 0.01, 0.2, H - 0.25, face + 0.12, face + 0.13, "CS_Brass")
        box(M, px - 0.12, px + 0.12, H - 0.18, H, face, face + 0.16, "CS_Brass")
        box(M, px - 0.12, px + 0.12, 0.0, 0.12, face, face + 0.16, "CS_Brass")
    lx0, lx1 = x0 - 0.2, x1 + 0.2
    box(M, lx0, lx1, H, H + 0.2, face, face + 0.16, "CS_Gold")
    box(M, lx0 + 0.04, lx1 - 0.04, H + 0.04, H + 0.16, face + 0.16, face + 0.17, "CS_Black")
    n = 9
    for k in range(n):
        bx = lx0 + 0.14 + (lx1 - lx0 - 0.28) * k / (n - 1)
        blob(M, bx, H + 0.1, face + 0.18, 0.028, 0.028, 0.02, "CS_Bulb", cuts=1)
    # the sunburst over the lintel, a crown at its heart
    cy = H + 0.2
    r_in, r_out = 0.16, 0.62
    wedges = 9
    for k in range(wedges):
        a0 = math.pi * k / wedges + 0.025
        a1 = math.pi * (k + 1) / wedges - 0.025
        pts = [(x + r_in * math.cos(a0), cy + r_in * math.sin(a0)), (x + r_out * math.cos(a0), cy + r_out * math.sin(a0)), (x + r_out * math.cos(a1), cy + r_out * math.sin(a1)), (x + r_in * math.cos(a1), cy + r_in * math.sin(a1))]
        vslab(M, list(reversed(pts)), face, face + 0.05, "CS_Gold" if k % 2 == 0 else "CS_Bulb")
    arc_o = [(x + 0.7 * math.cos(math.pi * k / 18), cy + 0.7 * math.sin(math.pi * k / 18)) for k in range(19)]
    arc_i = [(x + r_out * math.cos(math.pi * k / 18), cy + r_out * math.sin(math.pi * k / 18)) for k in range(19)]
    for k in range(18):
        vslab(M, [arc_i[k], arc_o[k], arc_o[k + 1], arc_i[k + 1]], face, face + 0.08, "CS_Brass")
    vslab(M, [(x + r_in * math.cos(math.pi * k / 10), cy + r_in * math.sin(math.pi * k / 10)) for k in range(11)], face, face + 0.08, "CS_Velvet")
    # the crown: a band and five points, each with a pearl
    cz = face + 0.09
    box(M, x - 0.1, x + 0.1, cy + 0.03, cy + 0.07, cz - 0.01, cz + 0.01, "CS_Gold")
    for k in range(5):
        px = x - 0.08 + 0.04 * k
        tip = cy + (0.15 if k % 2 == 0 else 0.12)
        vslab(M, [(px - 0.02, cy + 0.07), (px + 0.02, cy + 0.07), (px, tip)], cz - 0.01, cz + 0.01, "CS_Gold")
        blob(M, px, tip + 0.012, cz + 0.012, 0.012, 0.012, 0.01, "CS_Pearl", cuts=1)
    # the leaves (the game swings them open toward the room)
    for name, hx, sign in (("Prop_VipDoorL", x0, 1), ("Prop_VipDoorR", x1, -1)):
        D = Mesh()
        vip_leaf(D, hx, face + 0.05, w / 2 - 0.01, H - 0.05, sign)
        nodes.append({"name": name, "mesh": D, "origin": (hx, LIFT[0], face + 0.05), "force": "CS_Clay"})
    # the runner out across the stage, edged in gold
    rw = vd["runner"] / 2
    rz1 = face + 1.9
    box(M, x - rw, x + rw, 0.0, 0.005, face + 0.12, rz1, "CS_Runner")
    frame_strips(M, x - rw, x + rw, face + 0.12, rz1, 0.04, 0.0, 0.007, "CS_Inlay")
    # the brass stanchions flanking it, a velvet rope from each back to a ring on the wall
    for px in vd["posts"]:
        pz = -9.1
        lathe(M, px, pz, [(0, 0), (0.13, 0), (0.11, 0.04), (0, 0.045)], "CS_Brass", segs=12)
        cylinder(M, (px, 0.04, pz), (px, 0.95, pz), 0.032, "CS_Brass", sides=8)
        blob(M, px, 0.99, pz, 0.058, 0.058, 0.058, "CS_Gold", cuts=2)
        wx = px + (0.35 if px < x else -0.35)
        blob(M, wx, 0.86, face + 0.02, 0.04, 0.04, 0.02, "CS_Brass", cuts=1)
        seg = 6
        pts = [(px + (wx - px) * k / seg, 0.86 - 0.12 * 4 * (k / seg) * (1 - k / seg), pz + (face + 0.03 - pz) * k / seg) for k in range(seg + 1)]
        for u, v in zip(pts, pts[1:]):
            cylinder(M, u, v, 0.026, "CS_Velvet", sides=8)


# ---------------------------------------------------------------------------------------------
# the torch columns at the zones' corners


def build_pillars(M, L):
    p = L["pillars"]
    for x, z in p["at"]:
        box(M, x - 0.28, x + 0.28, 0.0, 0.1, z - 0.28, z + 0.28, "CS_Black")
        box(M, x - 0.285, x + 0.285, 0.1, 0.13, z - 0.285, z + 0.285, "CS_Gold")
        lathe(M, x, z, [(0, 0.13), (0.23, 0.13), (0.21, 0.2), (0.2, 1.92), (0.24, 1.98), (0, 1.98)], "CS_Black", segs=16)
        for k in range(12):
            a = 2 * math.pi * k / 12
            cylinder(M, (x + 0.203 * math.cos(a), 0.24, z + 0.203 * math.sin(a)), (x + 0.203 * math.cos(a), 1.86, z + 0.203 * math.sin(a)), 0.011, "CS_Gold", sides=5)
        lathe(M, x, z, [(0, 1.98), (0.25, 1.98), (0.3, 2.06), (0.3, 2.1), (0, 2.1)], "CS_Gold", segs=16)
        lathe(M, x, z, [(0, 2.1), (0.1, 2.1), (0.19, 2.19), (0.21, 2.25), (0, 2.23)], "CS_Brass", segs=14)
        blob(M, x, 2.3, z, 0.13, 0.07, 0.13, "CS_Flame", cuts=2)
        blob(M, x, 2.4, z, 0.08, 0.12, 0.08, "CS_FlameCore", cuts=2)


# ---------------------------------------------------------------------------------------------
# 1 the foyer: the Golden Cage, the planters, Madame Zara, the capsule machine


def build_cage(M, L):
    c = L["cage"]
    x0, x1, z0, z1 = c["x0"], c["x1"], c["z0"], c["z1"]
    counter = c["counter"]
    win = c["window"]
    ch = c["h"]
    h = L["half"]
    face_z = -h + L["walls"]["t"]
    front = z1 - 0.3  # the counter's back face (the bars stand on it)

    box(M, x0, x1, 0.0, counter - 0.05, front, z1, "CS_Mahogany")
    box(M, x0, x1, 0.0, 0.08, z1 - 0.02, z1 + 0.01, "CS_Gold")
    xk = x0 + 0.3
    while xk < x1 - 0.2:
        box(M, xk - 0.02, xk + 0.02, 0.14, counter - 0.14, z1, z1 + 0.012, "CS_Gold")
        xk += 0.4
    box(M, x0 - 0.02, x1, counter - 0.05, counter, front - 0.15, z1 + 0.08, "CS_MarbleLight")
    box(M, x0, x0 + 0.2, 0.0, counter, face_z, front, "CS_Mahogany")
    box(M, x0 - 0.01, x0 + 0.21, counter, counter + 0.04, face_z, front, "CS_Gold")
    bar_z = front + 0.12
    top_y = ch - 0.25
    x = x0 + 0.1
    while x < x1 - 0.05:
        if abs(x - win) > 0.55:
            cylinder(M, (x, counter, bar_z), (x, top_y, bar_z), 0.018, "CS_Brass", sides=8)
        x += 0.13
    z = face_z + 0.12
    while z < front:
        cylinder(M, (x0 + 0.1, counter, z), (x0 + 0.1, top_y, z), 0.018, "CS_Brass", sides=8)
        z += 0.13
    box(M, x0, x1, top_y - 0.04, top_y + 0.02, bar_z - 0.03, bar_z + 0.03, "CS_Brass")
    box(M, x0 + 0.07, x0 + 0.13, top_y - 0.04, top_y + 0.02, face_z, front, "CS_Brass")
    box(M, x0, x1, top_y, ch, front, z1, "CS_Mahogany")
    box(M, x0, x0 + 0.2, top_y, ch, face_z, front, "CS_Mahogany")
    box(M, x0, x1, top_y + 0.07, top_y + 0.12, z1, z1 + 0.012, "CS_Gold")
    for k, w in enumerate((1.3, 0.9, 0.5)):
        box(M, win - w / 2, win + w / 2, ch + k * 0.12, ch + (k + 1) * 0.12, front + 0.05 + k * 0.03, z1 - k * 0.03, "CS_Gold" if k != 1 else "CS_Mahogany")
    for sx in (-1, 1):
        box(M, win + sx * 0.55 - 0.035, win + sx * 0.55 + 0.035, counter, counter + 0.8, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    arc_c = counter + 0.8
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12
        pts = [(win + 0.51 * math.cos(a0), arc_c + 0.51 * math.sin(a0)), (win + 0.59 * math.cos(a0), arc_c + 0.59 * math.sin(a0)), (win + 0.59 * math.cos(a1), arc_c + 0.59 * math.sin(a1)), (win + 0.51 * math.cos(a1), arc_c + 0.51 * math.sin(a1))]
        vslab(M, pts, bar_z - 0.04, bar_z + 0.04, "CS_Gold")
    fl = c["floor"]
    box(M, x0 + 0.2, x1 - 0.2, 0.0, fl - 0.02, face_z, front, "CS_MahoganyDark")
    box(M, x0 + 0.2, x1 - 0.2, fl - 0.02, fl, face_z, front, "CS_Velvet")
    vx, vy = x1 - 0.62, fl + 1.25
    cylinder(M, (vx, vy, face_z), (vx, vy, face_z + 0.08), 0.4, "CS_Brass", sides=24)
    cylinder(M, (vx, vy, face_z + 0.08), (vx, vy, face_z + 0.1), 0.32, "CS_Black", sides=24)
    cylinder(M, (vx, vy, face_z + 0.1), (vx, vy, face_z + 0.2), 0.06, "CS_Gold", sides=12)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        cylinder(M, (vx, vy, face_z + 0.18), (vx + 0.22 * math.cos(a), vy + 0.22 * math.sin(a), face_z + 0.18), 0.02, "CS_Gold", sides=8)
    lx, lz = x0 + 0.3, z1 - 0.12
    lathe(M, lx, lz, [(0, 0), (0.09, 0), (0.09, 0.02), (0.02, 0.03), (0, 0.03)], "CS_Brass", segs=12, y0=counter)
    cylinder(M, (lx, counter + 0.03, lz), (lx, counter + 0.28, lz), 0.012, "CS_Brass", sides=6)
    obox(M, lx, lz, 0.0, -0.08, 0.08, -0.16, 0.16, counter + 0.28, counter + 0.34, "CS_Felt")
    obox(M, lx, lz, 0.0, -0.06, 0.06, -0.13, 0.13, counter + 0.26, counter + 0.28, "CS_Bulb")
    lathe(M, x1 - 0.3, z1 - 0.12, [(0, 0), (0.07, 0), (0.065, 0.03), (0.04, 0.07), (0.01, 0.09), (0, 0.1)], "CS_Gold", segs=12, y0=counter)
    for k, mat in enumerate(("CS_Red", "CS_Black", "CS_Ivory", "CS_Red")):
        lathe(M, win + 0.3, z1 - 0.1, [(0, 0), (0.05, 0), (0.05, 0.018), (0, 0.018)], mat, segs=12, y0=counter + k * 0.02)
    box(M, x1 - 0.2, x1, 0.0, counter, face_z, front, "CS_Mahogany")


def areca(M, x, z):
    """An areca palm in a fluted Art-Deco brass urn: a cluster of slender golden-green canes, their
    feathery fronds arching out high over the walkway (the urn is all that stands in the way)."""
    lathe(M, x, z, [(0, 0), (0.2, 0), (0.24, 0.05), (0.2, 0.1), (0.26, 0.4), (0.3, 0.5), (0.27, 0.53), (0, 0.53)], "CS_Brass", segs=16)
    lathe(M, x, z, [(0, 0.3), (0.285, 0.3), (0.29, 0.34), (0, 0.34)], "CS_Black", segs=16)
    for k in range(10):
        a = 2 * math.pi * k / 10
        cylinder(M, (x + 0.215 * math.cos(a), 0.12, z + 0.215 * math.sin(a)), (x + 0.27 * math.cos(a), 0.44, z + 0.27 * math.sin(a)), 0.012, "CS_Gold", sides=4)
    lathe(M, x, z, [(0, 0.5), (0.26, 0.5), (0.26, 0.52), (0, 0.52)], "CS_Trunk", segs=12)
    import random

    rnd = random.Random(int(x * 100 + z * 10))
    for c in range(4):
        a = 2 * math.pi * c / 4 + rnd.random()
        lean = 0.12 + rnd.random() * 0.1
        h = 1.25 + rnd.random() * 0.5
        base = (x + 0.06 * math.cos(a), 0.5, z + 0.06 * math.sin(a))
        tip = (x + lean * math.cos(a), h, z + lean * math.sin(a))
        cylinder(M, base, tip, 0.022, "CS_Cane", sides=6, r_end=0.014)
        for k in range(4):
            yaw = a + (k - 1.5) * 0.9 + rnd.random() * 0.3
            fx, fz = math.sin(yaw), math.cos(yaw)
            cx, cz = tip[0] + fx * 0.3, tip[2] + fz * 0.3
            blob(M, cx, tip[1] - 0.02, cz, 0.36, 0.022, 0.1, "CS_Areca" if k % 2 else "CS_ArecaLight", cuts=2, yaw=yaw - math.pi / 2, droop=0.2)


def build_foyer(M, L, cushions):
    for p in L["palms"]:
        areca(M, p["x"], p["z"])


class Frame:
    """A turned local frame on the floor: `lx` across, `lz` forward (toward heading `yaw`, 0 facing
    +z), y up, its origin at (cx, cz): for things that stand at an angle to the walls."""

    def __init__(self, cx, cz, yaw):
        self.cx, self.cz, self.yaw = cx, cz, yaw
        self.c, self.s = math.cos(yaw), math.sin(yaw)

    def p(self, lx, y, lz):
        return (self.cx + lx * self.c + lz * self.s, y, self.cz - lx * self.s + lz * self.c)

    def box(self, M, lx0, lx1, y0, y1, lz0, lz1, mat):
        obox(M, self.cx, self.cz, self.yaw, lz0, lz1, lx0, lx1, y0, y1, mat)

    def blob(self, M, lx, y, lz, hx, hy, hz, mat, **kw):
        x, _, z = self.p(lx, y, lz)
        blob(M, x, y, z, hx, hy, hz, mat, yaw=self.yaw + kw.pop("turn", 0.0), **kw)

    def lathe(self, M, lx, lz, profile, mat, **kw):
        x, _, z = self.p(lx, 0.0, lz)
        lathe(M, x, z, profile, mat, **kw)

    def cyl(self, M, a, b, r, mat, **kw):
        cylinder(M, self.p(*a), self.p(*b), r, mat, **kw)

    def face_slab(self, M, outline_xy, lz0, lz1, mat):
        """An (lx, y) outline standing across the frame, from lz0 to lz1 (a shape on its front)."""
        bm = M.bm
        a = [bm.verts.new(W(*self.p(x, y, lz0))) for x, y in outline_xy]
        b = [bm.verts.new(W(*self.p(x, y, lz1))) for x, y in outline_xy]
        bm.faces.new(list(reversed(a))).material_index = M.m(mat)
        bm.faces.new(b).material_index = M.m(mat)
        n = len(outline_xy)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = M.m(mat)


def build_zara(M, L, nodes):
    """Madame Zara's fortune booth, turned to face the camera's way: a lacquered base with a coin
    plate and a card slot, an open cabinet under a gold arch (velvet curtains drawn back, a starry
    backdrop), the lady herself (a Siamese in a jewelled turban, paws round a glowing crystal ball)
    sitting well forward so the camera sees her through the arch, a crescent crest, and her
    animatronic brass owl on the roof."""
    zr = L["zara"]
    F = Frame(zr["x"], zr["z"], zr.get("yaw", 0.0))
    hw, hd = zr["w"] / 2, zr["d"] / 2
    H = zr["h"]
    roof = H - 0.2
    sill = 0.74  # the cabinet's floor
    # the base
    F.box(M, -hw, hw, 0.0, 0.08, -hd, hd, "CS_Black")
    F.box(M, -hw + 0.02, hw - 0.02, 0.08, sill - 0.06, -hd + 0.02, hd - 0.02, "CS_ZaraPurple")
    for u0, u1, v0, v1 in ((-hw + 0.06, hw - 0.06, 0.12, 0.15), (-hw + 0.06, hw - 0.06, sill - 0.13, sill - 0.1), (-hw + 0.06, -hw + 0.09, 0.15, sill - 0.13), (hw - 0.09, hw - 0.06, 0.15, sill - 0.13)):
        F.box(M, u0, u1, v0, v1, hd - 0.02, hd + 0.005, "CS_Gold")
    F.box(M, -hw, hw, sill - 0.06, sill, hd - 0.1, hd + 0.02, "CS_Gold")
    F.box(M, -hw, hw, sill - 0.06, sill - 0.005, -hd, hd - 0.1, "CS_ZaraPlum")
    F.box(M, -0.12, 0.12, 0.4, 0.56, hd - 0.02, hd + 0.012, "CS_Brass")
    F.box(M, -0.04, 0.04, 0.46, 0.5, hd + 0.012, hd + 0.018, "CS_Black")
    F.box(M, -0.17, 0.17, 0.2, 0.24, hd - 0.02, hd + 0.012, "CS_Black")
    F.blob(M, 0.0, 0.31, hd + 0.004, 0.045, 0.045, 0.01, "CS_Gold", cuts=2)  # an eye on the panel
    F.blob(M, 0.0, 0.31, hd + 0.012, 0.018, 0.018, 0.008, "CS_Eye", cuts=1)
    # the cabinet: sides, back, roof
    F.box(M, -hw, -hw + 0.06, sill, roof, -hd, hd, "CS_ZaraPurple")
    F.box(M, hw - 0.06, hw, sill, roof, -hd, hd, "CS_ZaraPurple")
    F.box(M, -hw, hw, sill, roof, -hd, -hd + 0.06, "CS_ZaraPlum")
    F.box(M, -hw - 0.03, hw + 0.03, roof, roof + 0.07, -hd - 0.03, hd + 0.03, "CS_Gold")
    F.box(M, -hw, hw, roof + 0.07, roof + 0.12, -hd, hd, "CS_ZaraPurple")
    # the arch: gold posts up to its spring, a round head under the roof, purple spandrels beside it
    ar = hw - 0.03
    ac = roof - ar - 0.02
    for sx in (-ar + 0.035, ar - 0.035):
        F.box(M, sx - 0.035, sx + 0.035, sill, ac, hd - 0.05, hd + 0.01, "CS_Gold")
    for k in range(12):
        a0, a1 = math.pi * k / 12, math.pi * (k + 1) / 12
        F.face_slab(M, [((ar - 0.07) * math.cos(a0), ac + (ar - 0.07) * math.sin(a0)), (ar * math.cos(a0), ac + ar * math.sin(a0)), (ar * math.cos(a1), ac + ar * math.sin(a1)), ((ar - 0.07) * math.cos(a1), ac + (ar - 0.07) * math.sin(a1))], hd - 0.05, hd + 0.01, "CS_Gold")
    for sg in (-1, 1):
        rim = [(sg * ar * math.cos(math.pi * k / 12), ac + ar * math.sin(math.pi * k / 12)) for k in range(7)]
        outline = [(sg * (hw - 0.001), ac), (sg * (hw - 0.001), roof), (0.0, roof)] + list(reversed(rim))
        if sg > 0:
            outline = list(reversed(outline))
        F.face_slab(M, outline, hd - 0.045, hd + 0.005, "CS_ZaraPurple")
    # the backdrop's stars
    for sxs, sys_ in ((-0.3, 1.35), (-0.18, 1.62), (0.25, 1.48), (0.33, 1.2), (-0.36, 1.05), (0.1, 1.75), (0.32, 1.72), (-0.3, 1.8)):
        F.blob(M, sxs, sys_, -hd + 0.065, 0.018, 0.018, 0.006, "CS_StarGlow", cuts=1)
    # the curtains, drawn back to each side
    for sg in (-1, 1):
        F.blob(M, sg * 0.41, sill + 0.55, hd - 0.12, 0.06, 0.52, 0.05, "CS_Velvet", cuts=2)
        F.blob(M, sg * 0.38, sill + 0.35, hd - 0.1, 0.045, 0.03, 0.045, "CS_Gold", cuts=1)
    # the table and the crystal ball
    tz = 0.24
    t0 = sill
    F.lathe(M, 0.0, tz, [(0, t0), (0.1, t0), (0.03, t0 + 0.04), (0.03, t0 + 0.1), (0.19, t0 + 0.12), (0.19, t0 + 0.15), (0, t0 + 0.15)], "CS_Gold", segs=16)
    F.lathe(M, 0.0, tz, [(0, t0 + 0.15), (0.07, t0 + 0.15), (0.05, t0 + 0.18), (0, t0 + 0.18)], "CS_Brass", segs=12)
    F.blob(M, 0.0, t0 + 0.27, tz, 0.1, 0.1, 0.1, "CS_CrystalBall", cuts=3)
    # Madame Zara, seated just behind it
    zc = 0.0
    y0 = sill - 0.2  # her figure's datum (as if she sat on a floor at 0.94 - 0.2)
    F.blob(M, 0.0, y0 + 0.46, zc, 0.22, 0.24, 0.16, "CS_ZaraTeal", cuts=3)  # her shawl
    F.blob(M, 0.0, y0 + 0.62, zc + 0.03, 0.2, 0.08, 0.14, "CS_ZaraPurple", cuts=2)
    for sg in (-1, 1):
        F.cyl(M, (sg * 0.16, y0 + 0.56, zc + 0.02), (sg * 0.08, t0 + 0.26, tz - 0.05), 0.045, "CS_ZaraTeal", sides=8)
        F.blob(M, sg * 0.075, t0 + 0.26, tz - 0.07, 0.04, 0.03, 0.045, "CS_ZaraCream", cuts=1)
    F.blob(M, 0.0, y0 + 0.84, zc + 0.02, 0.15, 0.14, 0.13, "CS_ZaraCream", cuts=3)  # her head
    F.blob(M, 0.0, y0 + 0.79, zc + 0.12, 0.07, 0.06, 0.05, "CS_ZaraMask", cuts=2)  # the Siamese mask
    F.blob(M, 0.0, y0 + 0.81, zc + 0.165, 0.018, 0.013, 0.01, "CS_Eye", cuts=1)
    for sg in (-1, 1):
        F.blob(M, sg * 0.055, y0 + 0.87, zc + 0.13, 0.025, 0.018, 0.012, "CS_ZaraEye", cuts=1)
        F.blob(M, sg * 0.11, y0 + 0.98, zc, 0.04, 0.06, 0.03, "CS_ZaraMask", cuts=1)  # the ears, under the turban's edge
        F.lathe(M, sg * 0.15, zc + 0.03, [(0, y0 + 0.7), (0.025, y0 + 0.71), (0.025, y0 + 0.74), (0, y0 + 0.75)], "CS_Gold", segs=8)  # earrings
    F.blob(M, 0.0, y0 + 1.02, zc, 0.16, 0.1, 0.14, "CS_ZaraPurple", cuts=3)  # the turban
    F.blob(M, 0.0, y0 + 1.08, zc + 0.02, 0.11, 0.07, 0.11, "CS_ZaraPlum", cuts=2)
    F.blob(M, 0.0, y0 + 1.0, zc + 0.14, 0.03, 0.03, 0.015, "CS_Gold", cuts=1)
    F.blob(M, 0.0, y0 + 1.0, zc + 0.152, 0.015, 0.015, 0.008, "CS_Red", cuts=1)
    F.blob(M, 0.03, y0 + 1.14, zc + 0.08, 0.02, 0.09, 0.02, "CS_ZaraTeal", cuts=1, pitch=-0.3)  # a plume
    # the crest: a gold crescent moon with a star
    front = hd + 0.02
    moon_o = [(-0.02 + 0.2 * math.cos(math.pi * (0.3 + 1.4 * k / 12)), roof + 0.32 + 0.2 * math.sin(math.pi * (0.3 + 1.4 * k / 12))) for k in range(13)]
    moon_i = [(0.05 + 0.15 * math.cos(math.pi * (0.3 + 1.4 * k / 12)), roof + 0.34 + 0.15 * math.sin(math.pi * (0.3 + 1.4 * k / 12))) for k in range(13)]
    for k in range(12):
        F.face_slab(M, [moon_i[k], moon_o[k], moon_o[k + 1], moon_i[k + 1]], front - 0.04, front, "CS_Gold")
    F.blob(M, 0.14, roof + 0.36, front - 0.02, 0.04, 0.04, 0.02, "CS_StarGlow", cuts=1)
    # the owl on its perch, at the roof's back corner
    olx, olz = -hw + 0.22, -hd + 0.2
    oy = roof + 0.12
    F.lathe(M, olx, olz, [(0, oy), (0.09, oy), (0.03, oy + 0.03), (0.02, oy + 0.1), (0.07, oy + 0.12), (0, oy + 0.12)], "CS_Gold", segs=10)
    feet = oy + 0.12
    O = Mesh()
    F.blob(O, olx, feet + 0.13, olz, 0.1, 0.13, 0.09, "CS_Bronze", cuts=3)
    F.blob(O, olx, feet + 0.1, olz + 0.05, 0.07, 0.08, 0.05, "CS_Copper", cuts=2)
    for sg in (-1, 1):
        F.blob(O, olx + sg * 0.095, feet + 0.13, olz - 0.01, 0.03, 0.1, 0.07, "CS_Copper", cuts=2)  # the wings
        for k in range(3):
            F.blob(O, olx + sg * 0.12, feet + 0.08 + k * 0.05, olz, 0.008, 0.008, 0.008, "CS_Gold", cuts=1)  # rivets
        F.blob(O, olx + sg * 0.035, feet + 0.012, olz + 0.04, 0.025, 0.012, 0.03, "CS_Gold", cuts=1)  # the talons
    F.blob(O, olx, feet + 0.03, olz - 0.08, 0.04, 0.02, 0.05, "CS_Bronze", cuts=1)  # the tail
    nodes.append({"name": "Prop_ZaraOwl", "mesh": O, "origin": F.p(olx, feet, olz), "force": "CS_Sheen", "key": "owl"})
    Hd = Mesh()
    hy = feet + 0.25
    F.blob(Hd, olx, hy + 0.07, olz, 0.1, 0.085, 0.09, "CS_Bronze", cuts=3)
    F.blob(Hd, olx, hy + 0.065, olz + 0.055, 0.085, 0.06, 0.03, "CS_Copper", cuts=2)
    for sg in (-1, 1):
        F.blob(Hd, olx + sg * 0.04, hy + 0.075, olz + 0.08, 0.03, 0.03, 0.015, "CS_OwlEye", cuts=2)
        F.blob(Hd, olx + sg * 0.04, hy + 0.075, olz + 0.093, 0.012, 0.012, 0.006, "CS_Eye", cuts=1)
        F.blob(Hd, olx + sg * 0.07, hy + 0.15, olz, 0.02, 0.045, 0.02, "CS_Bronze", cuts=1)
    F.blob(Hd, olx, hy + 0.045, olz + 0.095, 0.014, 0.02, 0.014, "CS_Gold", cuts=1)
    nodes.append({"name": "Prop_ZaraOwlHead", "mesh": Hd, "origin": F.p(olx, hy, olz), "force": "CS_Sheen", "parent": "owl"})


def build_gachapon(M, L):
    """The capsule machine: a red lacquered column with gold bands, a crank and a chute on its face,
    and a gold-caged globe full of coloured capsules."""
    g = L["gachapon"]
    x, z, r = g["x"], g["z"], g["r"]
    lathe(M, x, z, [(0, 0), (r, 0), (r, 0.05), (r - 0.04, 0.09), (r - 0.04, 0.78), (r, 0.82), (r, 0.86), (0, 0.86)], "CS_CapRed", segs=20)
    for y0 in (0.05, 0.78):
        lathe(M, x, z, [(0, y0), (r + 0.01, y0), (r + 0.01, y0 + 0.035), (0, y0 + 0.035)], "CS_Gold", segs=20)
    fz = z + r - 0.04
    box(M, x - 0.15, x + 0.15, 0.3, 0.7, fz - 0.01, fz + 0.035, "CS_Gold")
    cylinder(M, (x, 0.55, fz + 0.03), (x, 0.55, fz + 0.08), 0.06, "CS_Chrome", sides=14)
    cylinder(M, (x - 0.07, 0.55, fz + 0.08), (x + 0.07, 0.55, fz + 0.08), 0.016, "CS_Chrome", sides=8)
    blob(M, x + 0.07, 0.55, fz + 0.1, 0.02, 0.02, 0.02, "CS_Red", cuts=1)
    box(M, x - 0.09, x + 0.09, 0.14, 0.27, fz - 0.005, fz + 0.04, "CS_Black")
    box(M, x - 0.08, x + 0.08, 0.2, 0.26, fz + 0.04, fz + 0.05, "CS_Chrome")
    box(M, x - 0.04, x + 0.04, 0.4, 0.42, fz + 0.035, fz + 0.04, "CS_Black")
    # the globe
    gy, R = 1.15, 0.29
    colours = ("CS_CapRed", "CS_CapBlue", "CS_CapYellow", "CS_CapGreen", "CS_CapPink", "CS_CapPurple", "CS_CapWhite")
    n = 46
    for k in range(n):
        yk = 1 - 2 * (k + 0.5) / n
        rk = math.sqrt(max(0.0, 1 - yk * yk))
        a = k * 2.399963
        rr = R - 0.055
        blob(M, x + rr * rk * math.cos(a), gy + rr * yk, z + rr * rk * math.sin(a), 0.052, 0.052, 0.052, colours[k % len(colours)], cuts=1)
    ring = [(x + (R + 0.01) * math.cos(2 * math.pi * k / 24), gy, z + (R + 0.01) * math.sin(2 * math.pi * k / 24)) for k in range(24)]
    for k in range(24):
        cylinder(M, ring[k], ring[(k + 1) % 24], 0.014, "CS_Gold", sides=6)
    for m_ in range(4):
        a = math.pi * m_ / 4
        pts = [(x + (R + 0.01) * math.cos(t) * math.cos(a), gy + (R + 0.01) * math.sin(t), z + (R + 0.01) * math.cos(t) * math.sin(a)) for t in (-math.pi / 2 + math.pi * k / 12 for k in range(13))]
        for k in range(12):
            cylinder(M, pts[k], pts[k + 1], 0.009, "CS_Gold", sides=5)
    lathe(M, x, z, [(0, gy + R - 0.02), (0.12, gy + R - 0.02), (0.09, gy + R + 0.04), (0, gy + R + 0.06)], "CS_Gold", segs=16)
    blob(M, x, gy + R + 0.09, z, 0.035, 0.035, 0.035, "CS_Gold", cuts=2)


# ---------------------------------------------------------------------------------------------
# 2 the main floor: the roulette table (and its wheel), the craps table, the blackjack tables

RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
WHEEL_R = 0.44


def wheel_centre(L):
    r = L["roulette"]
    return (r["x"] + r["wheel"], r["top"] + 0.005, r["z"])


def tip_jar(M, x, z, y):
    """A dealer's tip jar: pale glass with a gold band and a little label, chips and coins heaped in it."""
    lathe(M, x, z, [(0, 0), (0.055, 0), (0.062, 0.02), (0.062, 0.1), (0.05, 0.12), (0.054, 0.13), (0, 0.13)], "CS_JarGlass", segs=14, y0=y)
    lathe(M, x, z, [(0, 0.05), (0.064, 0.05), (0.064, 0.07), (0, 0.07)], "CS_Gold", segs=14, y0=y)
    box(M, x - 0.03, x + 0.03, y + 0.072, y + 0.095, z + 0.058, z + 0.066, "CS_Ivory")
    for k, (dx, dz, mat) in enumerate(((0.0, 0.0, "CS_Coin"), (0.02, 0.012, "CS_Red"), (-0.018, 0.01, "CS_Coin"), (0.005, -0.02, "CS_Ivory"))):
        lathe(M, x + dx, z + dz, [(0, 0), (0.024, 0), (0.024, 0.008), (0, 0.008)], mat, segs=10, y0=y + 0.13 + k * 0.004)


def build_roulette(M, L):
    r = L["roulette"]
    x0, x1 = r["x"] - r["len"] / 2, r["x"] + r["len"] / 2
    z0, z1 = r["z"] - r["w"] / 2, r["z"] + r["w"] / 2
    top = r["top"]
    slab(M, rounded_rect(x0 + 0.18, x1 - 0.18, z0 + 0.18, z1 - 0.18, 0.16), 0.0, 0.06, "CS_Gold")
    slab(M, rounded_rect(x0 + 0.22, x1 - 0.22, z0 + 0.22, z1 - 0.22, 0.14), 0.06, top - 0.1, "CS_Mahogany")
    slab(M, rounded_rect(x0, x1, z0, z1, 0.3), top - 0.1, top - 0.005, "CS_Mahogany")
    slab(M, rounded_rect(x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02, 0.28), top - 0.12, top - 0.1, "CS_Gold")
    slab(M, rounded_rect(x0 + 0.09, x1 - 0.09, z0 + 0.09, z1 - 0.09, 0.22), top - 0.005, top, "CS_Felt")
    gx0, gx1, gz0, gz1 = x0 + 1.05, x1 - 0.22, z0 + 0.22, z1 - 0.22
    cw, rh = (gx1 - gx0) / 12, (gz1 - gz0) / 3
    for col in range(12):
        for row in range(3):
            n = col * 3 + (3 - row)
            box(M, gx0 + col * cw + 0.012, gx0 + (col + 1) * cw - 0.012, top, top + 0.003, gz0 + row * rh + 0.012, gz0 + (row + 1) * rh - 0.012, "CS_FeltRed" if n in RED_NUMBERS else "CS_FeltBlack")
    box(M, gx0 - 0.16, gx0 - 0.02, top, top + 0.003, gz0 + 0.012, gz1 - 0.012, "CS_FeltZero")
    frame_strips(M, gx0 - 0.19, gx1 + 0.02, gz0 - 0.02, gz1 + 0.02, 0.018, top, top + 0.004, "CS_FeltGold")
    for k, (dx, dz, mat, n) in enumerate(((0.3, 0.25, "CS_Red", 4), (0.62, 0.18, "CS_Black", 3), (0.95, -0.3, "CS_Ivory", 5), (1.3, 0.3, "CS_Red", 2))):
        for j in range(n):
            lathe(M, r["x"] + dx - 0.6, r["z"] + dz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], mat if j % 2 == 0 else "CS_Ivory", segs=10, y0=top + j * 0.015)
    wx, _, wz = wheel_centre(L)
    lathe(M, wx, wz, [(0, top - 0.004), (WHEEL_R + 0.05, top - 0.004), (WHEEL_R + 0.05, top + 0.01), (0, top + 0.01)], "CS_Gold", segs=32)
    jx, jz = L["tipJars"]["vivienne"]
    tip_jar(M, jx, jz, top)


def build_wheel(L):
    """The roulette wheel on its own: its origin at its centre, the game spins it."""
    M = Mesh()
    wx, wy, wz = wheel_centre(L)
    y = wy + 0.01
    lathe(M, wx, wz, [(0, 0), (WHEEL_R, 0), (WHEEL_R, 0.07), (WHEEL_R - 0.05, 0.085), (WHEEL_R - 0.09, 0.06), (0, 0.06)], "CS_Mahogany", segs=36, y0=y)
    n = len(WHEEL_ORDER)
    for k, num in enumerate(WHEEL_ORDER):
        a0 = 2 * math.pi * k / n + 0.004
        a1 = 2 * math.pi * (k + 1) / n - 0.004
        mat = "CS_Felt" if num == 0 else "CS_Red" if num in RED_NUMBERS else "CS_Black"
        pts = [(wx + 0.22 * math.cos(a0), wz + 0.22 * math.sin(a0)), (wx + 0.34 * math.cos(a0), wz + 0.34 * math.sin(a0)), (wx + 0.34 * math.cos(a1), wz + 0.34 * math.sin(a1)), (wx + 0.22 * math.cos(a1), wz + 0.22 * math.sin(a1))]
        slab(M, pts, y + 0.06, y + 0.068, mat)
    lathe(M, wx, wz, [(0, 0.06), (0.22, 0.06), (0.14, 0.1), (0.06, 0.15), (0.025, 0.24), (0, 0.27)], "CS_Gold", segs=20, y0=y)
    for k in range(4):
        a = math.pi * k / 2
        cylinder(M, (wx, y + 0.2, wz), (wx + 0.13 * math.cos(a), y + 0.2, wz + 0.13 * math.sin(a)), 0.012, "CS_Gold", sides=6)
        blob(M, wx + 0.13 * math.cos(a), y + 0.2, wz + 0.13 * math.sin(a), 0.018, 0.018, 0.018, "CS_Gold", cuts=1)
    blob(M, wx + 0.3, y + 0.085, wz, 0.018, 0.018, 0.018, "CS_Ivory", cuts=2)
    return M, (wx, y, wz)


DIE = 0.09
PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (-1, 1), (1, -1), (1, 1)], 5: [(-1, -1), (-1, 1), (1, -1), (1, 1), (0, 0)], 6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)]}
# which face shows which number (the game turns a die to show its roll from this): +y 1, -y 6,
# +x 3, -x 4, +z 2, -z 5
DIE_FACES = {1: ((0, 1, 0), (1, 0, 0), (0, 0, 1)), 6: ((0, -1, 0), (1, 0, 0), (0, 0, 1)), 3: ((1, 0, 0), (0, 1, 0), (0, 0, 1)), 4: ((-1, 0, 0), (0, 1, 0), (0, 0, 1)), 2: ((0, 0, 1), (1, 0, 0), (0, 1, 0)), 5: ((0, 0, -1), (1, 0, 0), (0, 1, 0))}


def die_mesh(cx, cy, cz):
    D = Mesh()
    blob(D, cx, cy, cz, DIE / 2, DIE / 2, DIE / 2, "CS_DieRed", cuts=3, n=5.0)
    h = DIE / 2
    for num, (nrm, t1, t2) in DIE_FACES.items():
        for u, v in PIPS[num]:
            px = cx + nrm[0] * h + (t1[0] * u + t2[0] * v) * 0.022
            py = cy + nrm[1] * h + (t1[1] * u + t2[1] * v) * 0.022
            pz = cz + nrm[2] * h + (t1[2] * u + t2[2] * v) * 0.022
            blob(D, px, py, pz, 0.009 if nrm[0] == 0 else 0.004, 0.009 if nrm[1] == 0 else 0.004, 0.009 if nrm[2] == 0 else 0.004, "CS_Pip", cuts=1)
    return D


def build_craps_ropes(M, L):
    """The velvet ropes framing the craps table on its open sides."""
    for rope in L["craps"].get("ropes", []):
        velvet_rope(M, rope["a"], rope["b"])


def build_craps(M, L, nodes):
    """The craps table: a mahogany tub on two pedestals, a black padded rail, the felt bed laid out
    (the pass line, don't pass, come, the field, the centre bets), the stick on the rail, chips in
    the rail's groove, and the two dice (nodes: the game rolls them)."""
    c = L["craps"]
    x, z = c["x"], c["z"]
    hl, hw = c["len"] / 2, c["w"] / 2
    top, felt = c["top"], c["felt"]
    x0, x1, z0, z1 = x - hl, x + hl, z - hw, z + hw
    for sx in (-1, 1):
        lathe(M, x + sx * 0.95, z, [(0, 0), (0.36, 0), (0.36, 0.05), (0.14, 0.12), (0.12, felt - 0.14), (0.3, felt - 0.07), (0, felt - 0.07)], "CS_Mahogany", segs=16)
        lathe(M, x + sx * 0.95, z, [(0, 0.05), (0.365, 0.05), (0.365, 0.07), (0, 0.07)], "CS_Gold", segs=16)
    outer = rounded_rect(x0, x1, z0, z1, 0.55, 10)
    inner = rounded_rect(x0 + 0.16, x1 - 0.16, z0 + 0.16, z1 - 0.16, 0.4, 10)
    slab(M, outer, felt - 0.07, felt - 0.006, "CS_Mahogany")
    slab(M, inner, felt - 0.006, felt, "CS_Felt")
    band(M, outer, inner, felt, top - 0.06, "CS_Mahogany")
    band(M, outer, inner, top - 0.06, top, "CS_Black")
    rim = rounded_rect(x0 - 0.012, x1 + 0.012, z0 - 0.012, z1 + 0.012, 0.56, 10)
    band(M, rim, outer, top - 0.085, top - 0.06, "CS_Gold")
    # the felt's layout (in markings over the bed)
    fx0, fx1, fz0, fz1 = x0 + 0.3, x1 - 0.3, z0 + 0.28, z1 - 0.28
    frame_strips(M, fx0, fx1, fz0, fz1, 0.02, felt, felt + 0.003, "CS_FeltLine")
    frame_strips(M, fx0 + 0.12, fx1 - 0.12, fz0 + 0.12, fz1 - 0.12, 0.015, felt, felt + 0.003, "CS_FeltLine")
    box(M, x - 0.45, x + 0.45, felt, felt + 0.003, fz0 + 0.2, fz0 + 0.48, "CS_FeltGold")  # the field
    box(M, x - 0.44, x + 0.44, felt + 0.003, felt + 0.004, fz0 + 0.21, fz0 + 0.47, "CS_FeltZero")
    for k in range(7):
        box(M, x - 0.4 + k * 0.13, x - 0.35 + k * 0.13, felt + 0.004, felt + 0.005, fz0 + 0.3, fz0 + 0.38, "CS_Card")
    for sx in (-1, 1):
        box(M, x + sx * 0.75 - 0.28, x + sx * 0.75 + 0.28, felt, felt + 0.003, fz1 - 0.42, fz1 - 0.2, "CS_FeltRed")  # come / don't come
        box(M, x + sx * 0.75 - 0.25, x + sx * 0.75 + 0.25, felt + 0.003, felt + 0.004, fz1 - 0.39, fz1 - 0.23, "CS_Felt")
    box(M, x - 0.18, x + 0.18, felt, felt + 0.003, fz1 - 0.44, fz1 - 0.2, "CS_FeltBlack")  # the centre bets
    for k in range(4):
        box(M, x - 0.15 + k * 0.08, x - 0.1 + k * 0.08, felt + 0.003, felt + 0.004, fz1 - 0.4, fz1 - 0.24, "CS_FeltRed")
    # the stick along the near rail, chips in the rail's groove
    cylinder(M, (x - 1.2, top + 0.012, z1 - 0.07), (x + 0.4, top + 0.012, z1 - 0.07), 0.01, "CS_MahoganyDark", sides=6)
    cylinder(M, (x + 0.4, top + 0.012, z1 - 0.07), (x + 0.5, top + 0.012, z1 - 0.12), 0.012, "CS_MahoganyDark", sides=6)
    for k, mat in enumerate(("CS_Red", "CS_Black", "CS_Ivory", "CS_Red", "CS_Coin", "CS_Black")):
        lathe(M, x - 0.9 + k * 0.12, z0 + 0.07, [(0, 0), (0.035, 0), (0.035, 0.03), (0, 0.03)], mat, segs=10, y0=top)
    # the dice
    for k, (dx, dz) in enumerate(((-0.12, 0.08), (0.06, -0.04))):
        px, py, pz = x + dx, felt + DIE / 2, z + dz
        nodes.append({"name": f"Prop_CrapsDie{k + 1}", "mesh": die_mesh(px, py, pz), "origin": (px, py, pz), "force": "CS_Sheen"})


def stool(M, x, z, seat_top):
    """A velvet bar stool: a brass foot, post and foot ring, a round tufted seat."""
    lathe(M, x, z, [(0, 0), (0.17, 0), (0.16, 0.03), (0, 0.035)], "CS_Brass", segs=14)
    cylinder(M, (x, 0.03, z), (x, seat_top - 0.07, z), 0.028, "CS_Brass", sides=8)
    ring = 8
    for k in range(ring):
        a0, a1 = 2 * math.pi * k / ring, 2 * math.pi * (k + 1) / ring
        cylinder(M, (x + 0.14 * math.cos(a0), 0.2, z + 0.14 * math.sin(a0)), (x + 0.14 * math.cos(a1), 0.2, z + 0.14 * math.sin(a1)), 0.012, "CS_Brass", sides=6)
    lathe(M, x, z, [(0, seat_top - 0.07), (0.19, seat_top - 0.07), (0.21, seat_top - 0.035), (0.19, seat_top), (0, seat_top)], "CS_Velvet", segs=16)
    lathe(M, x, z, [(0, seat_top - 0.08), (0.2, seat_top - 0.08), (0.2, seat_top - 0.065), (0, seat_top - 0.065)], "CS_Gold", segs=16)


def build_blackjack(M, L, cushions):
    """Two half-moon tables against the east wall, each with its dealer behind its flat side (Cedric
    at Table 1 in green baize, Gideon at Table 2, high stakes, in blue): the chip rack along the
    dealer's edge, a card shoe and a discard tray either side of it, four stools round the curve
    facing the dealer and the room behind them."""
    b = L["blackjack"]
    r = b["r"]
    top = b["top"]
    seat = cushions["barStool"]["top"]
    yaw = b["yaw"]
    c, s_ = math.cos(yaw), math.sin(yaw)
    for t in b["tables"]:
        tx, tz = t["x"], t["z"]
        felt = "CS_FeltBlue" if t.get("felt") == "blue" else "CS_Felt"

        def P(lx, lz):
            return (tx + lx * c + lz * s_, tz - lx * s_ + lz * c)

        def arc(rad, n=24, a0=-90.0, a1=90.0):
            return [P(rad * math.sin(math.radians(a0 + (a1 - a0) * k / n)), rad * math.cos(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

        for sx in (-1, 1):
            px, pz = P(sx * 0.45, 0.35)
            lathe(M, px, pz, [(0, 0), (0.24, 0), (0.24, 0.04), (0.08, 0.1), (0.07, top - 0.16), (0.2, top - 0.1), (0, top - 0.1)], "CS_Mahogany", segs=14)
        slab(M, arc(r), top - 0.1, top - 0.02, "CS_Mahogany")
        slab(M, arc(r - 0.12), top - 0.02, top, felt)
        band(M, arc(r + 0.02), arc(r - 0.12), top - 0.02, top + 0.05, "CS_Velvet", closed=False)
        obox(M, tx, tz, yaw, -0.02, 0.08, -r, r, top - 0.02, top + 0.03, "CS_Mahogany")
        band(M, arc(0.64), arc(0.62), top, top + 0.003, "CS_FeltGold", closed=False)
        band(M, arc(0.44), arc(0.43), top, top + 0.003, "CS_FeltGold", closed=False)
        obox(M, tx, tz, yaw, 0.1, 0.24, -0.34, 0.34, top, top + 0.03, "CS_Black")
        for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red", "CS_Ivory")):
            obox(M, tx, tz, yaw, 0.12, 0.22, -0.3 + k * 0.1, -0.22 + k * 0.1, top + 0.03, top + 0.045, mat)
        for d2 in (-35, 25):
            px, pz = P(0.8 * math.sin(math.radians(d2)), 0.8 * math.cos(math.radians(d2)))
            obox(M, px, pz, yaw + math.radians(d2), -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Card")
        for d2 in b["stoolAngles"]:
            hh = yaw + math.radians(d2)
            stool(M, tx + b["stoolR"] * math.sin(hh), tz + b["stoolR"] * math.cos(hh), seat)
        # the shoe on the felt at one end of the rack, its cards showing toward the players; the
        # discard tray at the other
        shx, shz = P(0.58, 0.16)
        obox(M, shx, shz, yaw, -0.08, 0.08, -0.07, 0.07, top, top + 0.09, "CS_Mahogany")
        obox(M, shx, shz, yaw, 0.08, 0.095, -0.055, 0.055, top + 0.01, top + 0.08, "CS_Card")
        obox(M, shx, shz, yaw, -0.085, 0.085, -0.075, 0.075, top + 0.09, top + 0.1, "CS_Gold")
        dhx, dhz = P(-0.58, 0.16)
        obox(M, dhx, dhz, yaw, -0.07, 0.07, -0.06, 0.06, top, top + 0.02, "CS_Black")
        obox(M, dhx, dhz, yaw, -0.055, 0.055, -0.045, 0.045, top + 0.02, top + 0.05, "CS_Card")


# ---------------------------------------------------------------------------------------------
# 3 Neon Alley: the slot machines and the neon over them, the Turf Club, the coin pusher


def slot_machine(M, L, z, k, jasper=False):
    s = L["slots"]
    X0, X1 = s["x"] - s["d"] / 2, s["x"] + s["d"] / 2
    hw = s["w"] / 2
    H = s["h"]
    body = "CS_Gold" if jasper else "CS_SlotBody"
    neon = "CS_NeonCyan" if (k % 2 == 0) != jasper else "CS_NeonPink"
    box(M, X0, X1, 0.0, 0.8, z - hw + 0.02, z + hw - 0.02, body)
    box(M, X0, X1 + 0.02, 0.0, 0.06, z - hw + 0.01, z + hw - 0.01, "CS_Black")
    box(M, X0, X1 + 0.02, 0.8, 0.86, z - hw, z + hw, "CS_Chrome")
    box(M, X1 - 0.05, X1 + 0.1, 0.3, 0.36, z - 0.2, z + 0.2, "CS_Chrome")
    box(M, X0, X1 - 0.15, 0.86, H - 0.2, z - hw + 0.05, z + hw - 0.05, body)
    box(M, X1 - 0.17, X1 - 0.14, 1.02, 1.36, z - 0.3, z + 0.3, "CS_SlotScreen")
    for dz in (-0.1, 0.1):
        box(M, X1 - 0.14, X1 - 0.13, 1.02, 1.36, z + dz - 0.012, z + dz + 0.012, "CS_Black")
    frame = [(1.0, 1.02, -0.32, 0.32), (1.36, 1.38, -0.32, 0.32), (1.02, 1.36, -0.32, -0.3), (1.02, 1.36, 0.3, 0.32)]
    for y0, y1, a, b in frame:
        box(M, X1 - 0.15, X1 - 0.12, y0, y1, z + a, z + b, "CS_Chrome")
    box(M, X1 - 0.15, X1 + 0.06, 0.86, 0.93, z - 0.36, z + 0.36, "CS_Black")
    for j, mat in enumerate(("CS_Red", "CS_Gold", "CS_Red")):
        box(M, X1 - 0.08, X1 + 0.0, 0.93, 0.95, z - 0.2 + j * 0.2 - 0.04, z - 0.2 + j * 0.2 + 0.04, mat)
    box(M, X0, X1 - 0.1, H - 0.2, H - 0.03, z - hw, z + hw, body)
    for y in (H - 0.16, H - 0.09):
        box(M, X1 - 0.1, X1 - 0.08, y - 0.015, y + 0.015, z - hw + 0.06, z + hw - 0.06, neon)
    box(M, X0, X1 - 0.08, H - 0.03, H, z - hw - 0.01, z + hw + 0.01, "CS_Chrome")
    if jasper:
        cylinder(M, (X1 + 0.02, 0.95, z + hw + 0.03), (X1 + 0.12, 1.3, z + hw + 0.08), 0.018, "CS_Chrome", sides=8)
        blob(M, X1 + 0.12, 1.34, z + hw + 0.08, 0.05, 0.05, 0.05, "CS_Red", cuts=2)
    else:
        cylinder(M, (X1 - 0.3, 0.95, z + hw + 0.02), (X1 - 0.28, 1.4, z + hw + 0.07), 0.018, "CS_Chrome", sides=8)
        blob(M, X1 - 0.28, 1.44, z + hw + 0.07, 0.05, 0.05, 0.05, "CS_Red", cuts=2)


def build_alley(M, L):
    s = L["slots"]
    for k, z in enumerate(s["zs"]):
        slot_machine(M, L, z, k)
    slot_machine(M, L, s["jasper"], 0, jasper=True)
    face_x = wall_face(L)
    xa = face_x + 0.05
    ne = L["neon"]
    z0, z1, yb = ne["from"], ne["to"], ne["y"]
    for y in (yb - 0.08, yb + 0.38):
        cylinder(M, (xa, y, z0), (xa, y, z1), 0.022, "CS_NeonCyan", sides=8)
    n = int((z1 - z0) / 0.3)
    pts = [(z0 + (z1 - z0) * k / n, yb + 0.02 if k % 2 == 0 else yb + 0.28) for k in range(n + 1)]
    for (za, ya), (zb_, yb_) in zip(pts, pts[1:]):
        cylinder(M, (xa, ya, za), (xa, yb_, zb_), 0.022, "CS_NeonPink", sides=8)
    for z in (z0, z1):
        box(M, face_x, face_x + 0.08, yb - 0.14, yb + 0.44, z - 0.03, z + 0.03, "CS_Gold")


def build_pinballs(M, L):
    """Two vintage pinball cabinets at the end of the slot row, their backboxes against the wall and
    their flipper ends toward the aisle: a lacquered cabinet on chrome legs, a lit playfield under
    glass (pop bumpers, the flippers, a plunger), a coin door, and a backbox with a glowing
    backglass framed in neon."""
    pb = L["pinball"]
    face_x = wall_face(L)
    x0, x1 = face_x + 0.02, face_x + 0.02 + pb["len"]
    hw = pb["w"] / 2
    lo, hi = 0.74, 0.74 + 0.22
    back = x0 + 0.24
    for k, z in enumerate(pb["zs"]):
        neon = "CS_NeonCyan" if k % 2 == 0 else "CS_NeonPink"
        body = "CS_SlotBody"
        # chrome legs, a black kick plate
        for lx in (x0 + 0.34, x1 - 0.08):
            for sz in (-1, 1):
                cylinder(M, (lx, 0.0, z + sz * (hw - 0.06)), (lx, lo, z + sz * (hw - 0.06)), 0.025, "CS_Chrome", sides=8)
        # the cabinet: deeper at the back than at the flipper end (the playfield slopes toward you)
        vslab(M, [(back, lo), (x1, lo), (x1, lo + 0.18), (back, hi + 0.08)], z - hw, z + hw, body)
        box(M, x1 - 0.02, x1 + 0.005, lo + 0.03, lo + 0.15, z - hw + 0.04, z + hw - 0.04, "CS_Chrome")
        # the playfield under its glass: lit, with three pop bumpers, two flippers and the plunger lane
        vslab(M, [(back + 0.02, hi + 0.075), (x1 - 0.03, lo + 0.175), (x1 - 0.03, lo + 0.185), (back + 0.02, hi + 0.085)], z - hw + 0.04, z + hw - 0.04, "CS_SlotScreen")
        for bx_, bz_, mat in ((0.45, -0.12, "CS_Red"), (0.45, 0.12, "CS_Gold"), (0.62, 0.0, neon)):
            px = back + bx_
            py = (hi + 0.085) + ((lo + 0.185) - (hi + 0.085)) * (px - back - 0.02) / (x1 - back - 0.05)
            lathe(M, px, z + bz_, [(0, 0), (0.05, 0), (0.05, 0.035), (0, 0.035)], mat, segs=10, y0=py)
        for sz in (-1, 1):
            px = x1 - 0.2
            py = (hi + 0.085) + ((lo + 0.185) - (hi + 0.085)) * (px - back - 0.02) / (x1 - back - 0.05)
            obox(M, px, z + sz * 0.08, math.pi / 2 - sz * 0.5, -0.06, 0.06, -0.015, 0.015, py, py + 0.02, "CS_Ivory")
        cylinder(M, (x1 - 0.005, lo + 0.1, z + hw - 0.1), (x1 + 0.08, lo + 0.1, z + hw - 0.1), 0.012, "CS_Chrome", sides=6)
        blob(M, x1 + 0.09, lo + 0.1, z + hw - 0.1, 0.02, 0.02, 0.02, "CS_Red", cuts=1)
        # the rails along the glass
        for sz in (-1, 1):
            cylinder(M, (back, hi + 0.1, z + sz * (hw - 0.02)), (x1, lo + 0.2, z + sz * (hw - 0.02)), 0.016, "CS_Chrome", sides=6)
        # the backbox and its backglass
        box(M, x0, back, lo, hi + 0.95, z - hw + 0.02, z + hw - 0.02, body)
        box(M, back - 0.005, back + 0.01, hi + 0.3, hi + 0.85, z - hw + 0.08, z + hw - 0.08, "CS_SlotScreen")
        for y in (hi + 0.27, hi + 0.88):
            box(M, back, back + 0.02, y - 0.012, y + 0.012, z - hw + 0.06, z + hw - 0.06, neon)
        for sz in (-1, 1):
            box(M, back, back + 0.02, hi + 0.27, hi + 0.88, z + sz * (hw - 0.07) - 0.012, z + sz * (hw - 0.07) + 0.012, neon)
        box(M, x0 - 0.01, back + 0.02, hi + 0.95, hi + 0.99, z - hw, z + hw, "CS_Chrome")
        for j in range(5):
            blob(M, back + 0.02, hi + 0.2, z - hw + 0.1 + j * (pb["w"] - 0.2) / 4, 0.016, 0.016, 0.016, "CS_Bulb", cuts=1)


def horse_mesh(hx, hy, hz):
    """One of the Turf Club's horses and its rider, a tin figurine on a brass peg, facing +z (the
    silks and the coat are pale: the game tints each of the five)."""
    H = Mesh()
    lathe(H, hx, hz, [(0, 0), (0.028, 0), (0.028, 0.006), (0, 0.006)], "CS_Brass", segs=10, y0=hy)
    cylinder(H, (hx, hy + 0.006, hz), (hx, hy + 0.03, hz), 0.004, "CS_Brass", sides=5)
    blob(H, hx, hy + 0.058, hz, 0.024, 0.024, 0.05, "CS_HorseCoat", cuts=2)
    cylinder(H, (hx, hy + 0.066, hz + 0.038), (hx, hy + 0.09, hz + 0.058), 0.012, "CS_HorseCoat", sides=6)
    blob(H, hx, hy + 0.094, hz + 0.07, 0.012, 0.013, 0.024, "CS_HorseCoat", cuts=1)
    for sx in (-1, 1):
        for sz, lean in ((0.03, 0.02), (-0.03, -0.018)):
            cylinder(H, (hx + sx * 0.012, hy + 0.05, hz + sz), (hx + sx * 0.012, hy + 0.012, hz + sz + lean), 0.006, "CS_HorseDark", sides=5)
    blob(H, hx, hy + 0.07, hz - 0.052, 0.008, 0.02, 0.012, "CS_HorseDark", cuts=1)
    blob(H, hx, hy + 0.1, hz + 0.004, 0.014, 0.02, 0.014, "CS_Silk", cuts=1)
    blob(H, hx, hy + 0.125, hz + 0.01, 0.01, 0.01, 0.01, "CS_Silk", cuts=1)
    return H


def build_derby(M, L, nodes):
    """The Mechanical Turf Club: a mahogany race table along the alley, four lanes of green baize
    under a gold rail, a chequered finish at the far end, a little tote board at the start."""
    d = L["derby"]
    x, z = d["x"], d["z"]
    hl, hw = d["len"] / 2, d["w"] / 2
    top = d["top"]
    x0, x1, z0, z1 = x - hw, x + hw, z - hl, z + hl
    bed = top - 0.06
    box(M, x0 + 0.05, x1 - 0.05, 0.0, 0.08, z0 + 0.05, z1 - 0.05, "CS_Black")
    box(M, x0 + 0.04, x1 - 0.04, 0.08, top - 0.12, z0 + 0.04, z1 - 0.04, "CS_Mahogany")
    for zz in (z0 + 0.2, z1 - 0.2):
        box(M, x1 - 0.04, x1 - 0.03, 0.16, top - 0.2, zz - 0.012, zz + 0.012, "CS_Gold")
    box(M, x1 - 0.04, x1 - 0.03, top - 0.2, top - 0.18, z0 + 0.2, z1 - 0.2, "CS_Gold")
    box(M, x0, x1, top - 0.12, bed - 0.006, z0, z1, "CS_Mahogany")
    box(M, x0 + 0.08, x1 - 0.08, bed - 0.006, bed, z0 + 0.08, z1 - 0.08, "CS_Leaf")
    lanes = 4
    lw = (x1 - x0 - 0.16) / lanes
    for k in range(1, lanes):
        lx = x0 + 0.08 + k * lw
        box(M, lx - 0.006, lx + 0.006, bed, bed + 0.003, z0 + 0.1, z1 - 0.1, "CS_FeltLine")
    for k in range(10):
        for j in range(2):
            box(M, x0 + 0.08 + k * (x1 - x0 - 0.16) / 10, x0 + 0.08 + (k + 1) * (x1 - x0 - 0.16) / 10, bed, bed + 0.003, z1 - 0.2 + j * 0.03, z1 - 0.17 + j * 0.03, "CS_FeltLine" if (k + j) % 2 == 0 else "CS_FeltBlack")
    for a, b, c_, e in ((x0, x1, z0, z0 + 0.08), (x0, x1, z1 - 0.08, z1), (x0, x0 + 0.08, z0 + 0.08, z1 - 0.08), (x1 - 0.08, x1, z0 + 0.08, z1 - 0.08)):
        box(M, a, b, bed - 0.006, top, c_, e, "CS_Mahogany")
    for a, b, c_, e in ((x0 - 0.01, x1 + 0.01, z0 - 0.01, z0 + 0.03), (x0 - 0.01, x1 + 0.01, z1 - 0.03, z1 + 0.01), (x0 - 0.01, x0 + 0.03, z0 + 0.03, z1 - 0.03), (x1 - 0.03, x1 + 0.01, z0 + 0.03, z1 - 0.03)):
        box(M, a, b, top, top + 0.025, c_, e, "CS_Gold")
    # the tote board at the start
    box(M, x - 0.28, x + 0.28, top + 0.025, top + 0.05, z0 + 0.01, z0 + 0.07, "CS_Gold")
    box(M, x - 0.25, x + 0.25, top + 0.05, top + 0.28, z0 + 0.02, z0 + 0.06, "CS_Black")
    box(M, x - 0.22, x + 0.22, top + 0.08, top + 0.25, z0 + 0.06, z0 + 0.065, "CS_SlotScreen")
    for k in range(6):
        blob(M, x - 0.22 + k * 0.088, top + 0.3, z0 + 0.04, 0.014, 0.014, 0.014, "CS_Bulb", cuts=1)
    # the horse (the game races four of it, one per lane)
    hx, hy, hz = x0 + 0.08 + lw / 2, bed, z0 + 0.25
    nodes.append({"name": "Prop_DerbyHorse", "mesh": horse_mesh(hx, hy, hz), "origin": (hx, hy, hz), "force": "CS_Clay"})


def build_pusher(M, L, nodes, key="pusher", node="Prop_PusherPlate", high=False):
    """A coin pusher, facing the room (+x): a red and gold cabinet (the High-Roller's black lacquer,
    banded in gold), its playfield open behind gold posts (a mirrored back, two chrome shelves heaped
    with coins), a lit marquee on top, a coin tray at the front; the pushing plate is a node of its
    own (the game slides it)."""
    p = L[key]
    x, z = p["x"], p["z"]
    hd, hw, H = p["d"] / 2, p["w"] / 2, p["h"]
    x0, x1, z0, z1 = x - hd, x + hd, z - hw, z + hw
    body = "CS_Black" if high else "CS_SlotBody"
    box(M, x0, x1, 0.0, 0.06, z0, z1, "CS_Black")
    box(M, x0, x1 - 0.02, 0.06, 0.62, z0, z1, body)
    for a, b, c_, e in ((0.12, 0.15, z0 + 0.08, z1 - 0.08), (0.52, 0.55, z0 + 0.08, z1 - 0.08), (0.15, 0.52, z0 + 0.08, z0 + 0.11), (0.15, 0.52, z1 - 0.11, z1 - 0.08)):
        box(M, x1 - 0.025, x1 - 0.01, a, b, c_, e, "CS_Gold")
    box(M, x1 - 0.02, x1 + 0.14, 0.3, 0.36, z - 0.25, z + 0.25, "CS_Chrome")
    box(M, x1 + 0.12, x1 + 0.15, 0.36, 0.42, z - 0.25, z + 0.25, "CS_Chrome")
    for k in range(5):
        lathe(M, x1 + 0.05 + (k % 2) * 0.03, z - 0.15 + k * 0.07, [(0, 0), (0.03, 0), (0.03, 0.008), (0, 0.008)], "CS_Coin", segs=10, y0=0.36)
    box(M, x0, x1, 0.62, 1.45, z0, z0 + 0.06, body)
    box(M, x0, x1, 0.62, 1.45, z1 - 0.06, z1, body)
    box(M, x0, x0 + 0.06, 0.62, 1.45, z0 + 0.06, z1 - 0.06, "CS_Mirror")
    box(M, x0 + 0.06, x1 - 0.02, 0.62, 0.7, z0 + 0.06, z1 - 0.06, "CS_Chrome")
    box(M, x0 + 0.06, x1 - 0.28, 0.9, 0.95, z0 + 0.06, z1 - 0.06, "CS_Chrome")
    rng = 0
    for shelf_y, xa, xb in ((0.7, x0 + 0.38, x1 - 0.06), (0.95, x0 + 0.1, x1 - 0.3)):
        for k in range(26):
            rng = (rng * 1103515245 + 12345) % 2147483648
            u = (rng % 1000) / 1000
            rng = (rng * 1103515245 + 12345) % 2147483648
            v = (rng % 1000) / 1000
            cxk = xa + (xb - xa) * u
            czk = z0 + 0.1 + (z1 - z0 - 0.2) * v
            lathe(M, cxk, czk, [(0, 0), (0.03, 0), (0.03, 0.008), (0, 0.008)], "CS_Coin", segs=10, y0=shelf_y + (k % 3) * 0.008)
    for zz in (z0 + 0.03, z1 - 0.03):
        box(M, x1 - 0.05, x1, 0.62, 1.45, zz - 0.03, zz + 0.03, "CS_Gold")
    box(M, x1 - 0.05, x1, 1.38, 1.45, z0, z1, "CS_Gold")
    # the marquee
    box(M, x0, x1, 1.45, H - 0.08, z0, z1, body)
    box(M, x1 - 0.01, x1 + 0.01, 1.5, H - 0.13, z0 + 0.06, z1 - 0.06, "CS_Black")
    for k in range(7):
        blob(M, x1 + 0.015, 1.53, z0 + 0.1 + k * (z1 - z0 - 0.2) / 6, 0.018, 0.018, 0.018, "CS_Bulb", cuts=1)
        blob(M, x1 + 0.015, H - 0.16, z0 + 0.1 + k * (z1 - z0 - 0.2) / 6, 0.018, 0.018, 0.018, "CS_Bulb", cuts=1)
    cylinder(M, (x1 + 0.02, (1.53 + H - 0.16) / 2, z0 + 0.12), (x1 + 0.02, (1.53 + H - 0.16) / 2, z1 - 0.12), 0.016, "CS_NeonPink", sides=8)
    box(M, x0 - 0.01, x1 + 0.01, H - 0.08, H, z0 - 0.01, z1 + 0.01, "CS_Gold")
    if high:
        # the High-Roller's gold: bands round the base and the marquee, a crown crest on top
        for y in (0.06, 0.6, 1.45):
            box(M, x0 - 0.012, x1 + 0.012, y, y + 0.03, z0 - 0.012, z1 + 0.012, "CS_Gold")
        for zz in (z0, z1):
            box(M, x0 - 0.012, x0 + 0.03, 0.06, H, zz - 0.012, zz + 0.012, "CS_Gold")
        for k in range(5):
            h_ = 0.1 + 0.05 * (k % 2)
            cz = z0 + 0.12 + k * (z1 - z0 - 0.24) / 4
            box(M, x1 - 0.12, x1 - 0.04, H, H + h_, cz - 0.03, cz + 0.03, "CS_Gold")
            blob(M, x1 - 0.08, H + h_ + 0.025, cz, 0.025, 0.025, 0.025, "CS_Bulb", cuts=1)
    # the plate
    P = Mesh()
    box(P, x0 + 0.06, x0 + 0.36, 0.7, 0.8, z0 + 0.07, z1 - 0.07, "CS_Gold" if high else "CS_Chrome")
    box(P, x0 + 0.34, x0 + 0.36, 0.7, 0.8, z0 + 0.07, z1 - 0.07, "CS_ChromeDark")
    nodes.append({"name": node, "mesh": P, "origin": (x0 + 0.21, 0.7, z), "force": "CS_Sheen"})


# ---------------------------------------------------------------------------------------------
# 4 the High-Roller Stage (built on it): the poker table, its chairs, the velvet ropes, the VIP room


def chair(M, x, z, yaw, seat_top):
    """A tufted velvet chair on mahogany legs, facing `yaw`, its back behind the sitter."""
    obox(M, x, z, yaw, -0.23, 0.23, -0.23, 0.23, seat_top - 0.12, seat_top - 0.06, "CS_Mahogany")
    obox(M, x, z, yaw, -0.22, 0.24, -0.22, 0.22, seat_top - 0.06, seat_top, "CS_Velvet")
    f = (math.sin(yaw), math.cos(yaw))
    r = (f[1], -f[0])
    for a, b in ((-0.19, -0.19), (-0.19, 0.19), (0.19, -0.19), (0.19, 0.19)):
        px, pz = x + f[0] * a + r[0] * b, z + f[1] * a + r[1] * b
        cylinder(M, (px, 0.0, pz), (px, seat_top - 0.12, pz), 0.025, "CS_Mahogany", sides=6)
    obox(M, x, z, yaw, -0.29, -0.21, -0.23, 0.23, seat_top - 0.06, seat_top + 0.52, "CS_Velvet")
    obox(M, x, z, yaw, -0.3, -0.2, -0.25, 0.25, seat_top + 0.52, seat_top + 0.57, "CS_Mahogany")
    for b in (-0.12, 0.0, 0.12):
        for up in (0.18, 0.36):
            px, pz = x + f[0] * -0.205 + r[0] * b, z + f[1] * -0.205 + r[1] * b
            blob(M, px, seat_top + up, pz, 0.012, 0.012, 0.012, "CS_Gold", cuts=1)


def velvet_rope(M, a, b):
    """Brass stanchions a pace apart from a to b, a velvet rope sagging between each two."""
    (ax, az), (bx, bz) = a, b
    n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
    posts = [(ax + (bx - ax) * k / n, az + (bz - az) * k / n) for k in range(n + 1)]
    for px, pz in posts:
        lathe(M, px, pz, [(0, 0), (0.12, 0), (0.1, 0.04), (0, 0.045)], "CS_Brass", segs=12)
        cylinder(M, (px, 0.04, pz), (px, 0.9, pz), 0.03, "CS_Brass", sides=8)
        blob(M, px, 0.93, pz, 0.052, 0.052, 0.052, "CS_Brass", cuts=2)
    for (pa, qa), (pb, qb) in zip(posts, posts[1:]):
        seg = 8
        pts = [(pa + (pb - pa) * k / seg, 0.84 - 0.14 * 4 * (k / seg) * (1 - k / seg), qa + (qb - qa) * k / seg) for k in range(seg + 1)]
        for u, v in zip(pts, pts[1:]):
            cylinder(M, u, v, 0.028, "CS_Velvet", sides=8)


def build_pit(M, L, cushions, nodes):
    p = L["poker"]
    x, z = p["x"], p["z"]
    top = p["top"]
    outer = rounded_rect(x - p["len"] / 2, x + p["len"] / 2, z - p["w"] / 2, z + p["w"] / 2, p["w"] / 2, per_corner=10)
    inner = rounded_rect(x - p["len"] / 2 + 0.14, x + p["len"] / 2 - 0.14, z - p["w"] / 2 + 0.14, z + p["w"] / 2 - 0.14, p["w"] / 2 - 0.14, per_corner=10)
    for sx in (-1, 1):
        lathe(M, x + sx * 0.65, z, [(0, 0), (0.34, 0), (0.34, 0.05), (0.12, 0.12), (0.1, top - 0.14), (0.28, top - 0.08), (0, top - 0.08)], "CS_Mahogany", segs=16)
        lathe(M, x + sx * 0.65, z, [(0, 0.05), (0.345, 0.05), (0.345, 0.07), (0, 0.07)], "CS_Gold", segs=16)
    slab(M, outer, top - 0.08, top - 0.02, "CS_Mahogany")
    band(M, outer, inner, top - 0.02, top + 0.04, "CS_Velvet")
    slab(M, inner, top - 0.02, top, "CS_Felt")
    band(M, inner, rounded_rect(x - p["len"] / 2 + 0.16, x + p["len"] / 2 - 0.16, z - p["w"] / 2 + 0.16, z + p["w"] / 2 - 0.16, p["w"] / 2 - 0.16, per_corner=10), top, top + 0.003, "CS_FeltGold")
    seat = cushions["pokerChair"]["top"]
    for cx in p["chairs"]:
        c = {"x": cx, "z": p["chairZ"], "yaw": math.pi}
        chair(M, c["x"], c["z"], c["yaw"], seat)
        px, pz = c["x"], z + (c["z"] - z) * 0.45
        for j in range(3):
            lathe(M, px, pz, [(0, 0), (0.045, 0), (0.045, 0.014), (0, 0.014)], ("CS_Red", "CS_Black", "CS_Ivory")[j], segs=10, y0=top + j * 0.015)
        obox(M, px + 0.12, pz, 0.3, -0.07, 0.07, -0.05, 0.05, top, top + 0.004, "CS_Card")
    box(M, x - 0.3, x + 0.3, top, top + 0.04, z - p["w"] / 2 + 0.18, z - p["w"] / 2 + 0.32, "CS_Black")
    for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red")):
        box(M, x - 0.26 + k * 0.105, x - 0.18 + k * 0.105, top + 0.04, top + 0.055, z - p["w"] / 2 + 0.2, z - p["w"] / 2 + 0.3, mat)
    jx, jz = L["tipJars"]["boris"]
    tip_jar(M, jx, jz, top)
    for rope in L["ropes"]:
        velvet_rope(M, rope["a"], rope["b"])
    # the brass balustrade along the stage's side over the lounge
    bl = L["balustrade"]
    bx = bl["x"]
    n = max(1, round((bl["z1"] - bl["z0"]) / 0.45))
    for k in range(n + 1):
        pz_ = bl["z0"] + (bl["z1"] - bl["z0"]) * k / n
        cylinder(M, (bx, 0.0, pz_), (bx, 0.86, pz_), 0.02 if k % n else 0.035, "CS_Brass", sides=8)
    for y in (0.3, 0.86):
        cylinder(M, (bx, y, bl["z0"]), (bx, y, bl["z1"]), 0.025, "CS_Brass", sides=8)
    build_vip_doors(M, L, nodes)


# ---------------------------------------------------------------------------------------------
# 5 the Velvet Lounge & Jazz Bar (built on the lounge's dais)


def bottle(M, x, z, y0, kind):
    mats = ("CS_BottleGreen", "CS_BottleAmber", "CS_BottleRuby", "CS_Ivory")
    tall = 0.3 if kind % 3 else 0.24
    lathe(M, x, z, [(0, 0), (0.045, 0), (0.048, tall * 0.6), (0.02, tall * 0.8), (0.016, tall), (0, tall)], mats[kind % len(mats)], segs=8, y0=y0)


def club_chair(M, x, z, yaw, seat_top):
    """A velvet club chair facing `yaw`: a low body, a deep cushion, a round back, rolled arms."""
    obox(M, x, z, yaw, -0.3, 0.3, -0.34, 0.34, 0.0, 0.04, "CS_Gold")
    obox(M, x, z, yaw, -0.3, 0.3, -0.34, 0.34, 0.04, seat_top - 0.06, "CS_Velvet")
    obox(M, x, z, yaw, -0.18, 0.31, -0.26, 0.26, seat_top - 0.06, seat_top, "CS_Velvet")
    obox(M, x, z, yaw, -0.32, -0.16, -0.34, 0.34, seat_top - 0.06, seat_top + 0.44, "CS_Velvet")
    for side in (-1, 1):
        obox(M, x, z, yaw, -0.3, 0.31, side * 0.26 if side > 0 else -0.34, 0.34 if side > 0 else -0.26, seat_top - 0.06, seat_top + 0.17, "CS_Velvet")
        obox(M, x, z, yaw, -0.3, 0.31, side * 0.27 if side > 0 else -0.33, 0.33 if side > 0 else -0.27, seat_top + 0.17, seat_top + 0.185, "CS_Gold")


def build_bar(M, L, cushions):
    b = L["bar"]
    x0, x1, z0, z1 = b["x0"], b["x1"], b["z0"], b["z1"]
    top = b["top"]
    face_x = wall_face(L)
    box(M, face_x, face_x + 0.45, 0.0, 1.0, z0 + 0.05, z1 - 0.05, "CS_MahoganyDark")
    box(M, face_x, face_x + 0.5, 1.0, 1.04, z0 + 0.03, z1 - 0.03, "CS_MarbleLight")
    box(M, face_x, face_x + 0.02, 1.04, 2.6, z0 + 0.25, z1 - 0.25, "CS_Mirror")
    for zz in (z0 + 0.2, z1 - 0.2):
        box(M, face_x, face_x + 0.12, 1.04, 2.7, zz - 0.06, zz + 0.06, "CS_Gold")
    for y in (1.5, 2.0):
        box(M, face_x, face_x + 0.3, y, y + 0.03, z0 + 0.26, z1 - 0.26, "CS_Mahogany")
    box(M, face_x + 0.02, face_x + 0.04, 2.5, 2.54, z0 + 0.26, z1 - 0.26, "CS_Bulb")
    box(M, face_x, face_x + 0.14, 2.6, 2.7, z0 + 0.14, z1 - 0.14, "CS_Mahogany")
    zm = (z0 + z1) / 2
    for k, w in enumerate((1.6, 1.0, 0.5)):
        box(M, face_x, face_x + 0.12 - k * 0.02, 2.7 + k * 0.12, 2.82 + k * 0.12, zm - w / 2, zm + w / 2, "CS_Gold" if k != 1 else "CS_Mahogany")
    k = 0
    for y in (1.04, 1.53, 2.03):
        zz = z0 + 0.4
        while zz < z1 - 0.35:
            # the back counter's far end holds the espresso machine
            if (k * 7) % 5 != 0 and not (y == 1.04 and zz > z1 - 1.0):
                bottle(M, face_x + 0.16 + (0.1 if y == 1.04 else 0), zz, y, k)
            zz += 0.2
            k += 1
    # the espresso machine: chrome and brass, an eagle on its dome, two little cups
    ex, ez = face_x + 0.25, z1 - 0.65
    box(M, ex - 0.16, ex + 0.12, 1.04, 1.36, ez - 0.2, ez + 0.2, "CS_Chrome")
    box(M, ex - 0.17, ex + 0.13, 1.36, 1.39, ez - 0.21, ez + 0.21, "CS_Brass")
    lathe(M, ex - 0.02, ez, [(0, 1.39), (0.13, 1.39), (0.1, 1.46), (0.04, 1.5), (0, 1.51)], "CS_Brass", segs=14)
    blob(M, ex - 0.02, 1.55, ez, 0.03, 0.035, 0.05, "CS_Gold", cuts=1)
    for dz in (-0.09, 0.09):
        cylinder(M, (ex + 0.12, 1.26, ez + dz), (ex + 0.2, 1.26, ez + dz), 0.022, "CS_ChromeDark", sides=8)
        lathe(M, ex + 0.2, ez + dz, [(0, 0), (0.03, 0), (0.035, 0.045), (0, 0.045)], "CS_Ivory", segs=10, y0=1.04)
    box(M, ex + 0.12, ex + 0.26, 1.04, 1.06, ez - 0.16, ez + 0.16, "CS_ChromeDark")
    # Pippin's duckboard step behind the counter (its top is `floor`: his feet)
    fl = b["floor"]
    box(M, face_x + 0.45, x1 - 0.35, 0.0, fl - 0.02, z0 + 0.3, z1 - 0.3, "CS_MahoganyDark")
    zz = z0 + 0.35
    while zz < z1 - 0.35:
        box(M, face_x + 0.47, x1 - 0.37, fl - 0.02, fl, zz, min(zz + 0.12, z1 - 0.32), "CS_Mahogany")
        zz += 0.16
    box(M, x1 - 0.35, x1, 0.08, top - 0.04, z0, z1, "CS_Mahogany")
    box(M, x1 - 0.33, x1 - 0.02, 0.0, 0.08, z0 + 0.02, z1 - 0.02, "CS_Black")
    zz = z0 + 0.2
    while zz < z1 - 0.1:
        box(M, x1, x1 + 0.015, 0.14, top - 0.1, zz - 0.02, zz + 0.02, "CS_Gold")
        zz += 0.35
    box(M, x1 - 0.6, x1 + 0.08, top - 0.04, top, z0 - 0.05, z1 + 0.05, "CS_Mahogany")
    box(M, x1 + 0.08, x1 + 0.11, top - 0.045, top, z0 - 0.05, z1 + 0.05, "CS_Gold")
    for za, zb in ((z0, z0 + 0.3), (z1 - 0.3, z1)):
        box(M, face_x + 0.45, x1 - 0.35, 0.0, top - 0.04, za, zb, "CS_Mahogany")
        box(M, face_x + 0.45, x1 - 0.35, top - 0.04, top, za - 0.05 if za == z0 else za, zb + 0.05 if zb == z1 else zb, "CS_Mahogany")
    cylinder(M, (x1 + 0.1, 0.15, z0 + 0.1), (x1 + 0.1, 0.15, z1 - 0.1), 0.025, "CS_Brass", sides=10)
    zz = z0 + 0.4
    while zz < z1 - 0.2:
        cylinder(M, (x1, 0.15, zz), (x1 + 0.1, 0.15, zz), 0.015, "CS_Brass", sides=6)
        zz += 1.2
    lathe(M, x1 - 0.18, z0 + 1.2, [(0, 0), (0.045, 0), (0.05, 0.14), (0.03, 0.2), (0, 0.22)], "CS_Brass", segs=12, y0=top)
    for zz in (z0 + 2.3, z0 + 3.6, z0 + 4.9):
        lathe(M, x1 - 0.15, zz, [(0, 0), (0.035, 0), (0.01, 0.02), (0.01, 0.08), (0.05, 0.13), (0, 0.13)], "CS_Ivory", segs=10, y0=top)
    # Pippin's menu: a gold-framed card standing on the counter by him
    mz = L["npcs"]["pippin"]["z"] + 0.45
    box(M, x1 - 0.3, x1 - 0.22, top, top + 0.012, mz - 0.1, mz + 0.1, "CS_Gold")
    box(M, x1 - 0.27, x1 - 0.25, top + 0.012, top + 0.24, mz - 0.09, mz + 0.09, "CS_Gold")
    box(M, x1 - 0.25, x1 - 0.245, top + 0.03, top + 0.22, mz - 0.075, mz + 0.075, "CS_Paper")
    for k in range(3):
        box(M, x1 - 0.245, x1 - 0.242, top + 0.17 - k * 0.05, top + 0.18 - k * 0.05, mz - 0.05, mz + 0.05, "CS_Ink")
    seat = cushions["barStool"]["top"]
    for zz in b["stools"]:
        stool(M, b["stoolX"], zz, seat)


def build_piano(M, L, cushions):
    """The baby grand on the lounge's front-right apron: its keyboard toward the room, its tail to the
    back wall, the pianist facing the wall with the floor on their right, where the lid opens (at 45
    degrees, on its stick, its gold harp and strings showing under it); the bench; and a brass stage
    spotlight on a stand at the dais's corner, trained on the keys (the game lights it)."""
    pn = L["piano"]
    px, pz = pn["x"], pn["z"]
    hw, hl = pn["w"] / 2, pn["len"] / 2
    top = pn["top"]
    # across: -1 the bass side (straight), +1 the treble (curved); along: -1 the tail, +1 the keys
    shape = [(-1, 1), (1, 1), (1, 0.3), (0.86, -0.15), (0.6, -0.52), (0.2, -0.8), (-0.4, -0.96), (-1, -1)]
    outline = [(px + a * hw, pz + c * hl) for a, c in shape]
    inset = [(px + a * (hw - 0.06), pz + c * (hl - 0.06)) for a, c in shape]
    slab(M, outline, 0.58, top - 0.08, "CS_Black")
    band(M, outline, inset, top - 0.08, top, "CS_Black")
    # the gold harp (the iron frame) and the strings under the lid
    harp = [(px + a * (hw - 0.1), pz + min(c, 0.72) * (hl - 0.1)) for a, c in shape]
    slab(M, harp, top - 0.08, top - 0.05, "CS_Gold")
    for k in range(9):
        sx = px - hw + 0.18 + (2 * hw - 0.36) * k / 8
        cylinder(M, (sx, top - 0.045, pz + hl * 0.62), (sx, top - 0.045, pz - hl * (0.2 + 0.6 * (1 - k / 8))), 0.004, "CS_Chrome", sides=4)
    for a, c in ((-0.78, 0.72), (0.78, 0.72), (-0.35, -0.8)):
        lathe(M, px + a * hw, pz + c * hl, [(0, 0), (0.06, 0), (0.05, 0.05), (0.075, 0.5), (0.05, 0.58), (0, 0.58)], "CS_Black", segs=10)
        lathe(M, px + a * hw, pz + c * hl, [(0, 0.0), (0.055, 0.0), (0.055, 0.03), (0, 0.03)], "CS_Brass", segs=10)
    # the keyboard
    kz0, kz1 = pz + hl, pz + hl + 0.2
    box(M, px - hw + 0.04, px + hw - 0.04, 0.62, 0.72, kz0 - 0.02, kz1, "CS_Black")
    box(M, px - hw + 0.1, px + hw - 0.1, 0.72, 0.745, kz0, kz1 - 0.02, "CS_Ivory")
    nkeys = 22
    for j in range(nkeys):
        if j % 7 in (2, 6):
            continue
        kx = px - hw + 0.1 + (2 * hw - 0.2) * (j + 0.7) / nkeys
        box(M, kx - 0.012, kx + 0.012, 0.745, 0.765, kz0, kz0 + 0.1, "CS_Black")
    for sx in (-1, 1):
        box(M, px + sx * (hw - 0.04) - 0.04, px + sx * (hw - 0.04) + 0.04, 0.62, 0.8, kz0 - 0.02, kz1, "CS_Black")
    # the music desk, a sheet of music on it
    vslab(M, [(px - 0.36, top), (px + 0.36, top), (px + 0.36, top + 0.26), (px - 0.36, top + 0.26)], kz0 - 0.14, kz0 - 0.11, "CS_Black")
    vslab(M, [(px - 0.16, top + 0.04), (px + 0.1, top + 0.04), (px + 0.1, top + 0.22), (px - 0.16, top + 0.22)], kz0 - 0.11, kz0 - 0.1, "CS_Paper")
    # the lyre and its pedals
    box(M, px - 0.07, px + 0.07, 0.04, 0.6, kz0 - 0.12, kz0 - 0.06, "CS_Black")
    for dx in (-0.05, 0.0, 0.05):
        box(M, px + dx - 0.012, px + dx + 0.012, 0.04, 0.06, kz0 - 0.06, kz0 + 0.04, "CS_Gold")
    # the lid, hinged on the bass side and propped open 45 degrees: its underside to the floor
    hx = px - hw
    ca, sa = math.cos(math.radians(pn["lid"])), math.sin(math.radians(pn["lid"]))
    lid = [(hx + (x - hx) * ca, top + 0.02 + (x - hx) * sa, z) for x, z in outline]
    under = [(hx + (x - hx) * ca + 0.02 * sa, top + (x - hx) * sa - 0.02 * ca + 0.02, z) for x, z in outline]
    bm = M.bm
    va = [bm.verts.new(W(*q)) for q in lid]
    vb = [bm.verts.new(W(*q)) for q in under]
    bm.faces.new(va).material_index = M.m("CS_Black")
    bm.faces.new(list(reversed(vb))).material_index = M.m("CS_Black")
    for i in range(len(va)):
        j = (i + 1) % len(va)
        bm.faces.new((va[i], va[j], vb[j], vb[i])).material_index = M.m("CS_Black")
    stick_x = px + 0.28
    cylinder(M, (stick_x, top, pz - 0.1), (hx + (stick_x - hx) / ca * ca, top + (stick_x - hx) / ca * sa - 0.01, pz - 0.1), 0.012, "CS_Black", sides=6)
    # the bench, facing the keys
    bz = pn["bench"]
    btop = cushions["pianoBench"]["top"]
    box(M, px - 0.45, px + 0.45, btop - 0.06, btop, bz - 0.18, bz + 0.18, "CS_Velvet")
    box(M, px - 0.46, px + 0.46, btop - 0.1, btop - 0.06, bz - 0.19, bz + 0.19, "CS_Black")
    for a in (-0.4, 0.4):
        for c in (-0.14, 0.14):
            cylinder(M, (px + a, 0.0, bz + c), (px + a, btop - 0.1, bz + c), 0.025, "CS_Black", sides=6)
    # the spotlight: a brass tripod, a pole, a black Deco can with a brass cowl, its lens aglow
    sp = pn["spot"]
    sx, sz, sh = sp["x"], sp["z"], sp["h"]
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        cylinder(M, (sx, 0.55, sz), (sx + 0.22 * math.cos(a), 0.0, sz + 0.22 * math.sin(a)), 0.012, "CS_Brass", sides=6)
    cylinder(M, (sx, 0.0, sz), (sx, sh - 0.12, sz), 0.02, "CS_Brass", sides=8)
    lathe(M, sx, sz, [(0, 0.5), (0.04, 0.5), (0.04, 0.6), (0, 0.6)], "CS_Brass", segs=10)
    kx, ky, kz = px, 0.8, pz + hl + 0.05
    dx, dy, dz = kx - sx, ky - sh, kz - sz
    ln = math.sqrt(dx * dx + dy * dy + dz * dz)
    dx, dy, dz = dx / ln, dy / ln, dz / ln
    a0 = (sx - dx * 0.14, sh - dy * 0.14, sz - dz * 0.14)
    a1 = (sx + dx * 0.16, sh + dy * 0.16, sz + dz * 0.16)
    cylinder(M, a0, a1, 0.085, "CS_Black", sides=12, r_end=0.1)
    cylinder(M, a1, (a1[0] + dx * 0.05, a1[1] + dy * 0.05, a1[2] + dz * 0.05), 0.105, "CS_Brass", sides=12, r_end=0.11)
    cylinder(M, (a1[0] + dx * 0.02, a1[1] + dy * 0.02, a1[2] + dz * 0.02), (a1[0] + dx * 0.035, a1[1] + dy * 0.035, a1[2] + dz * 0.035), 0.085, "CS_Bulb", sides=12)
    cylinder(M, (sx, sh - 0.12, sz), (sx, sh, sz), 0.03, "CS_Brass", sides=8)


def build_billiards(M, L, nodes):
    """The billiards table under its brass lamp: turned mahogany legs, green baize, cushion rails
    with ivory sights, six pockets, the balls racked at the foot, a cue laid by, and the cue ball (a
    node: the game rolls it at a break)."""
    b = L["billiards"]
    x, z = b["x"], b["z"]
    hl, hw = b["len"] / 2, b["w"] / 2
    top = b["top"]
    x0, x1, z0, z1 = x - hl, x + hl, z - hw, z + hw
    for lx in (x0 + 0.22, x, x1 - 0.22):
        for lz in (z0 + 0.2, z1 - 0.2):
            lathe(M, lx, lz, [(0, 0), (0.09, 0), (0.08, 0.06), (0.05, 0.12), (0.075, 0.3), (0.06, 0.5), (0.08, top - 0.24), (0, top - 0.24)], "CS_Mahogany", segs=12)
            lathe(M, lx, lz, [(0, 0.1), (0.07, 0.1), (0.07, 0.125), (0, 0.125)], "CS_Gold", segs=12)
    felt = top - 0.04
    box(M, x0 + 0.08, x1 - 0.08, top - 0.25, top - 0.1, z0 + 0.08, z1 - 0.08, "CS_Mahogany")
    box(M, x0 + 0.08, x1 - 0.08, top - 0.26, top - 0.25, z0 + 0.08, z1 - 0.08, "CS_Gold")
    box(M, x0 + 0.14, x1 - 0.14, top - 0.1, felt, z0 + 0.14, z1 - 0.14, "CS_Felt")
    rails = ((x0, x1, z0, z0 + 0.14), (x0, x1, z1 - 0.14, z1), (x0, x0 + 0.14, z0 + 0.14, z1 - 0.14), (x1 - 0.14, x1, z0 + 0.14, z1 - 0.14))
    for a, bb, c, d in rails:
        box(M, a, bb, top - 0.1, top, c, d, "CS_Mahogany")
    for a, bb, c, d in ((x0 + 0.14, x1 - 0.14, z0 + 0.14, z0 + 0.18), (x0 + 0.14, x1 - 0.14, z1 - 0.18, z1 - 0.14), (x0 + 0.14, x0 + 0.18, z0 + 0.18, z1 - 0.18), (x1 - 0.18, x1 - 0.14, z0 + 0.18, z1 - 0.18)):
        box(M, a, bb, felt, top - 0.01, c, d, "CS_FeltDark")
    for k in range(1, 8):
        if k == 4:
            continue
        sx = x0 + 0.14 + (x1 - x0 - 0.28) * k / 8
        for zz in (z0 + 0.07, z1 - 0.07):
            blob(M, sx, top + 0.003, zz, 0.012, 0.004, 0.008, "CS_Ivory", cuts=1)
    for k in range(1, 4):
        sz = z0 + 0.14 + (z1 - z0 - 0.28) * k / 4
        for xx in (x0 + 0.07, x1 - 0.07):
            blob(M, xx, top + 0.003, sz, 0.008, 0.004, 0.012, "CS_Ivory", cuts=1)
    for px, pz in ((x0 + 0.15, z0 + 0.15), (x0 + 0.15, z1 - 0.15), (x1 - 0.15, z0 + 0.15), (x1 - 0.15, z1 - 0.15), (x, z0 + 0.12), (x, z1 - 0.12)):
        lathe(M, px, pz, [(0, felt - 0.02), (0.065, felt - 0.02), (0.07, top + 0.004), (0, top + 0.004)], "CS_Gold", segs=12)
        lathe(M, px, pz, [(0, felt - 0.019), (0.05, felt - 0.019), (0.05, top + 0.006), (0, top + 0.006)], "CS_Black", segs=12)
    # the rack of fifteen at the foot spot, the apex toward the head
    R = 0.028
    colours = ("CS_BallYellow", "CS_BallBlue", "CS_BallRed", "CS_BallPurple", "CS_BallOrange", "CS_BallGreen", "CS_BallMaroon", "CS_Black")
    fx = x1 - 0.62
    k = 0
    for row in range(5):
        for j in range(row + 1):
            bx = fx + row * R * 1.75
            bz = z + (j - row / 2) * R * 2.02
            blob(M, bx, felt + R, bz, R, R, R, "CS_Black" if (row, j) == (2, 1) else colours[k % 7], cuts=2)
            k += 1
    # a cue laid along the near rail
    cylinder(M, (x0 + 0.35, top + 0.012, z1 - 0.05), (x1 - 0.5, top + 0.009, z1 - 0.05), 0.013, "CS_MahoganyDark", sides=6, r_end=0.007)
    # the cue ball, at the head spot
    C = Mesh()
    hx = x0 + 0.62
    blob(C, hx, felt + R, z, R, R, R, "CS_Ivory", cuts=2)
    nodes.append({"name": "Prop_CueBall", "mesh": C, "origin": (hx, felt + R + LIFT[0], z), "force": "CS_Sheen"})
    # the lamp: a brass bar on two rods, three green glass shades with their bulbs
    ly = b["lamp"]
    cylinder(M, (x - 0.85, ly + 0.14, z), (x + 0.85, ly + 0.14, z), 0.022, "CS_Brass", sides=8)
    for sx in (-0.85, 0.85):
        blob(M, x + sx, ly + 0.14, z, 0.03, 0.03, 0.03, "CS_Brass", cuts=1)
        cylinder(M, (x + sx * 0.8, ly + 0.14, z), (x + sx * 0.8, 3.55 - LIFT[0], z), 0.008, "CS_Brass", sides=5)
        lathe(M, x + sx * 0.8, z, [(0, 3.55 - LIFT[0]), (0.06, 3.55 - LIFT[0]), (0.04, 3.59 - LIFT[0]), (0, 3.6 - LIFT[0])], "CS_Brass", segs=10)
    for sx in (-0.58, 0.0, 0.58):
        cylinder(M, (x + sx, ly + 0.14, z), (x + sx, ly + 0.08, z), 0.01, "CS_Brass", sides=6)
        lathe(M, x + sx, z, [(0, ly - 0.035), (0.16, ly - 0.05), (0.155, ly - 0.01), (0.06, ly + 0.07), (0, ly + 0.085)], "CS_ShadeGreen", segs=16)
        blob(M, x + sx, ly - 0.055, z, 0.05, 0.03, 0.05, "CS_Bulb", cuts=1)


def build_chesterfield(M, L, cushions):
    """The Chesterfield against the back wall, facing the room (+z): oxblood leather deep-buttoned
    all over, rolled arms, bun feet; the coffee table in front of it with The Velvet Gazette (folded,
    the masthead up), a tumbler and a dish of mints."""
    s = L["sofa"]
    F = Frame(s["x"], s["z"], 0.0)
    hl = s["len"] / 2
    seat_top = cushions["chesterfield"]["top"]
    front, back = 0.35, -0.45  # along lz: the seat's front edge, the back's rear
    for fx in (-hl + 0.06, hl - 0.06):
        for fz in (front - 0.06, back + 0.06):
            F.blob(M, fx, 0.035, fz, 0.035, 0.035, 0.035, "CS_Gold", cuts=1)
    F.box(M, -hl + 0.02, hl - 0.02, 0.06, seat_top - 0.09, back, front, "CS_Leather")
    for sx_ in s["seats"]:
        lx = sx_ - s["x"]
        F.blob(M, lx, seat_top - 0.045, front - 0.2, 0.29, 0.05, 0.21, "CS_Leather", cuts=3, n=3.2)
        for dx in (-0.12, 0.12):
            F.blob(M, lx + dx, seat_top + 0.003, front - 0.2, 0.012, 0.006, 0.012, "CS_LeatherDark", cuts=1)
    bz = -0.22
    F.box(M, -hl + 0.02, hl - 0.02, seat_top - 0.09, seat_top + 0.36, back, bz, "CS_Leather")
    F.cyl(M, (-hl + 0.02, seat_top + 0.36, bz - 0.1), (hl - 0.02, seat_top + 0.36, bz - 0.1), 0.115, "CS_Leather", sides=12)
    for row in range(3):
        yy = seat_top + 0.08 + row * 0.1
        n = 10
        for k in range(n + 1):
            xx = -hl + 0.14 + (2 * hl - 0.28) * (k + (0.5 if row % 2 else 0)) / n
            if xx > hl - 0.12:
                continue
            F.blob(M, xx, yy, bz + 0.002, 0.014, 0.014, 0.006, "CS_LeatherDark", cuts=1)
    for side in (-1, 1):
        xa, xb = (-hl - 0.02, -hl + 0.14) if side < 0 else (hl - 0.14, hl + 0.02)
        F.box(M, xa, xb, seat_top - 0.09, seat_top + 0.16, back, front, "CS_Leather")
        F.cyl(M, ((xa + xb) / 2, seat_top + 0.16, back), ((xa + xb) / 2, seat_top + 0.16, front + 0.02), 0.1, "CS_Leather", sides=12)
        for k in range(8):
            F.blob(M, (xa + xb) / 2, seat_top - 0.05 + k * 0.03, front + 0.012, 0.005, 0.005, 0.005, "CS_Brass", cuts=1)
    # the coffee table
    c = L["coffee"]
    cx, cz = c["x"], c["z"]
    top = c["top"]
    hx, hz = c["lx"] / 2, c["lz"] / 2
    for lx in (cx - hx + 0.06, cx + hx - 0.06):
        for lz in (cz - hz + 0.06, cz + hz - 0.06):
            cylinder(M, (lx, 0.0, lz), (lx, top - 0.04, lz), 0.025, "CS_Mahogany", sides=8, r_end=0.02)
            blob(M, lx, 0.02, lz, 0.03, 0.02, 0.03, "CS_Gold", cuts=1)
    box(M, cx - hx + 0.03, cx + hx - 0.03, top - 0.1, top - 0.04, cz - hz + 0.03, cz + hz - 0.03, "CS_Mahogany")
    box(M, cx - hx, cx + hx, top - 0.04, top, cz - hz, cz + hz, "CS_MarbleLight")
    box(M, cx - hx - 0.008, cx + hx + 0.008, top - 0.05, top - 0.03, cz - hz - 0.008, cz + hz + 0.008, "CS_Gold")
    # The Velvet Gazette
    gx, gz, gy = cx - 0.12, cz + 0.02, top
    obox(M, gx, gz, 0.25 + math.pi / 2, -0.13, 0.13, -0.18, 0.18, gy, gy + 0.018, "CS_Paper")
    obox(M, gx, gz, 0.25 + math.pi / 2, 0.06, 0.12, -0.16, 0.16, gy + 0.018, gy + 0.02, "CS_FeltRed")
    for k in range(5):
        obox(M, gx, gz, 0.25 + math.pi / 2, 0.02 - k * 0.03, 0.03 - k * 0.03, -0.15, 0.15 - (0.06 if k % 2 else 0.0), gy + 0.018, gy + 0.02, "CS_Ink")
    lathe(M, cx + 0.28, cz - 0.12, [(0, 0), (0.035, 0), (0.04, 0.08), (0, 0.08)], "CS_BottleAmber", segs=10, y0=top)
    lathe(M, cx + 0.3, cz + 0.1, [(0, 0), (0.07, 0), (0.08, 0.03), (0, 0.03)], "CS_Gold", segs=12, y0=top)
    for k in range(4):
        blob(M, cx + 0.3 + 0.03 * math.cos(k * 1.6), top + 0.035, cz + 0.1 + 0.03 * math.sin(k * 1.6), 0.018, 0.012, 0.018, "CS_CapWhite", cuts=1)


def build_lounge(M, L, cushions, nodes):
    build_bar(M, L, cushions)
    build_piano(M, L, cushions)
    build_chesterfield(M, L, cushions)
    build_bigsix(M, L, nodes)


def build_bigsix(M, L, nodes):
    """The Big Six wheel flush against the lounge's wall, facing the room: an Art-Deco
    cabinet (mahogany, fluted gold, a sunburst on its front) with a gilt fan crest of bulbs over the
    wheel, the axle's post and the leather flapper at the top that clicks over the pegs; a betting
    ledge before it, its six segments laid out on the felt. The wheel itself is a node
    (Prop_BigSixWheel, its origin at the hub): the game turns it about its facing."""
    b = L["bigSix"]
    F = Frame(b["x"], b["z"], b["yaw"])
    R = b["r"]
    hub = b["hub"]
    # the cabinet
    F.box(M, -0.72, 0.72, 0.0, 0.08, -0.26, 0.26, "CS_Black")
    F.box(M, -0.7, 0.7, 0.08, 0.76, -0.24, 0.24, "CS_Mahogany")
    F.box(M, -0.74, 0.74, 0.76, 0.8, -0.28, 0.28, "CS_Gold")
    for lx in (-0.62, 0.62):
        for k in (-1, 0, 1):
            F.box(M, lx + k * 0.035 - 0.008, lx + k * 0.035 + 0.008, 0.14, 0.7, 0.24, 0.252, "CS_Gold")
    for k in range(7):
        a0 = math.pi * (0.1 + 0.8 * k / 7)
        a1 = math.pi * (0.1 + 0.8 * (k + 1) / 7) - 0.04
        F.face_slab(M, [(0.0, 0.14), (0.36 * math.cos(a0), 0.14 + 0.36 * math.sin(a0)), (0.36 * math.cos(a1), 0.14 + 0.36 * math.sin(a1))], 0.24, 0.252, "CS_Gold")
    # the posts either side of the wheel and the axle's post behind it
    for lx in (-(R + 0.12), R + 0.12):
        F.cyl(M, (lx, 0.8, -0.05), (lx, hub + R * 0.55, -0.05), 0.045, "CS_Gold", sides=10)
        F.blob(M, lx, hub + R * 0.55 + 0.05, -0.05, 0.06, 0.06, 0.06, "CS_Gold", cuts=2)
    F.box(M, -0.07, 0.07, 0.8, hub, -0.2, -0.1, "CS_Mahogany")
    F.cyl(M, (0.0, hub, -0.1), (0.0, hub, -0.02), 0.05, "CS_Gold", sides=12)
    # the crest over it: a gilt fan and its bulbs
    cy = hub + R + 0.12
    for k in range(9):
        a0 = math.pi * (0.04 + 0.92 * k / 9)
        a1 = math.pi * (0.04 + 0.92 * (k + 1) / 9) - 0.03
        F.face_slab(M, [(0.1 * math.cos((a0 + a1) / 2), cy + 0.1 * math.sin((a0 + a1) / 2)), (0.48 * math.cos(a0), cy + 0.48 * math.sin(a0)), (0.48 * math.cos(a1), cy + 0.48 * math.sin(a1))], -0.12, -0.08, "CS_Gold" if k % 2 else "CS_Brass")
        am = (a0 + a1) / 2
        F.blob(M, 0.5 * math.cos(am), cy + 0.5 * math.sin(am), -0.08, 0.025, 0.025, 0.025, "CS_Bulb", cuts=1)
    F.cyl(M, (-0.12, cy - 0.02, -0.1), (0.12, cy - 0.02, -0.1), 0.03, "CS_Gold", sides=8)
    # the flapper: a gold bracket from behind, a leather tongue hanging over the rim at the top
    F.cyl(M, (0.0, hub + R + 0.06, -0.08), (0.0, hub + R + 0.06, 0.07), 0.012, "CS_Gold", sides=6)
    F.face_slab(M, [(-0.025, hub + R + 0.06), (0.025, hub + R + 0.06), (0.012, hub + R - 0.1), (-0.012, hub + R - 0.1)], 0.07, 0.085, "CS_Leather")
    # the betting ledge: a mahogany counter on a gilt plinth, green felt, the six segments on it
    lz = b["ledge"]
    lw = b["ledgeW"] / 2
    top = b["top"]
    F.box(M, -lw, lw, 0.0, 0.08, lz - 0.2, lz + 0.2, "CS_Black")
    F.box(M, -lw + 0.02, lw - 0.02, 0.08, top - 0.06, lz - 0.17, lz + 0.17, "CS_Mahogany")
    F.box(M, -lw - 0.02, lw + 0.02, top - 0.06, top - 0.01, lz - 0.21, lz + 0.21, "CS_Mahogany")
    F.box(M, -lw + 0.04, lw - 0.04, top - 0.01, top, lz - 0.17, lz + 0.17, "CS_Felt")
    F.box(M, -lw - 0.025, lw + 0.025, top - 0.075, top - 0.06, lz - 0.215, lz + 0.215, "CS_Gold")
    colours = ("CS_Ivory", "CS_SixSky", "CS_SixGreen", "CS_SixViolet", "CS_SixOrange", "CS_Black")
    cw = (2 * lw - 0.16) / 6
    for k, c in enumerate(colours):
        l0 = -lw + 0.08 + k * cw + 0.012
        F.box(M, l0, l0 + cw - 0.024, top, top + 0.003, lz - 0.1, lz + 0.1, c)
        F.box(M, l0 + 0.02, l0 + cw - 0.044, top + 0.003, top + 0.005, lz - 0.02, lz + 0.02, "CS_FeltGold" if k != 5 else "CS_Gold")
    # the wheel: a disc on its axle, 53 lacquered segments, a gilt rim with a peg between each two,
    # and a gold star on the hub
    Wm = Mesh()
    segs = b["segments"]
    n = len(segs)
    colour = {"1": "CS_Ivory", "2": "CS_SixSky", "5": "CS_SixGreen", "10": "CS_SixViolet", "20": "CS_SixOrange", "joker": "CS_Black"}
    fwd = (math.sin(b["yaw"]), math.cos(b["yaw"]))
    across = (math.cos(b["yaw"]), -math.sin(b["yaw"]))

    def wp(r, theta, f):
        """A point on the wheel: `r` out from the hub at angle `theta` (clockwise from the top as you
        face it), `f` out of its face toward the room."""
        u, v = r * math.sin(theta), r * math.cos(theta)
        return (b["x"] + across[0] * u + fwd[0] * f, hub + v, b["z"] + across[1] * u + fwd[1] * f)

    def ring_band(r0, r1, f0, f1, mat, steps=n * 2):
        bm = Wm.bm
        outer = [bm.verts.new(W(*wp(r1, 2 * math.pi * k / steps, f1))) for k in range(steps)]
        inner = [bm.verts.new(W(*wp(r0, 2 * math.pi * k / steps, f1))) for k in range(steps)]
        outer_b = [bm.verts.new(W(*wp(r1, 2 * math.pi * k / steps, f0))) for k in range(steps)]
        for k in range(steps):
            j = (k + 1) % steps
            bm.faces.new((outer[k], outer[j], inner[j], inner[k])).material_index = Wm.m(mat)
            bm.faces.new((outer_b[k], outer_b[j], outer[j], outer[k])).material_index = Wm.m(mat)

    # the disc's back and edge
    bm = Wm.bm
    back = [bm.verts.new(W(*wp(R - 0.02, 2 * math.pi * k / 64, 0.0))) for k in range(64)]
    frontv = [bm.verts.new(W(*wp(R - 0.02, 2 * math.pi * k / 64, 0.04))) for k in range(64)]
    bm.faces.new(back).material_index = Wm.m("CS_Mahogany")
    for k in range(64):
        j = (k + 1) % 64
        bm.faces.new((back[k], back[j], frontv[j], frontv[k])).material_index = Wm.m("CS_Mahogany")
    for k, sym in enumerate(segs):
        t0 = 2 * math.pi * k / n + 0.004
        t1 = 2 * math.pi * (k + 1) / n - 0.004
        pts = [wp(0.2, t0, 0.045), wp(R - 0.08, t0, 0.045), wp(R - 0.08, (t0 + t1) / 2, 0.045), wp(R - 0.08, t1, 0.045), wp(0.2, t1, 0.045)]
        flat(Wm, pts, colour[sym], (fwd[0], 0.0, fwd[1]))
        # the segment's mark: a pip for each x in its name (a star for the Joker), toward the rim
        mid = (t0 + t1) / 2
        marks = {"1": 1, "2": 2, "5": 3, "10": 4, "20": 5, "joker": 0}[sym]
        for m in range(marks):
            cx = wp(R - 0.14 - m * 0.075, mid, 0.047)
            q = [wp(R - 0.14 - m * 0.075 + 0.018 * math.cos(a), mid + 0.018 * math.sin(a) / (R - 0.14 - m * 0.075), 0.047) for a in (0.0, 1.57, 3.14, 4.71)]
            flat(Wm, q, "CS_Gold" if sym != "1" else "CS_MahoganyDark", (fwd[0], 0.0, fwd[1]))
        if sym == "joker":
            for m in range(5):
                a = 2 * math.pi * m / 5
                rr = R - 0.2
                q = [wp(rr, mid, 0.048), wp(rr + 0.08 * math.cos(a), mid + 0.08 * math.sin(a) / rr, 0.048), wp(rr + 0.03 * math.cos(a + 0.6), mid + 0.03 * math.sin(a + 0.6) / rr, 0.048)]
                flat(Wm, q, "CS_Gold", (fwd[0], 0.0, fwd[1]))
    # the spokes' dividers, the gilt rim, the pegs
    for k in range(n):
        t = 2 * math.pi * k / n
        q = [wp(0.2, t - 0.0035, 0.046), wp(R - 0.08, t - 0.0035, 0.046), wp(R - 0.08, t + 0.0035, 0.046), wp(0.2, t + 0.0035, 0.046)]
        flat(Wm, q, "CS_Gold", (fwd[0], 0.0, fwd[1]))
        cylinder(Wm, wp(R - 0.03, t, 0.04), wp(R - 0.03, t, 0.1), 0.007, "CS_Chrome", sides=5)
    ring_band(R - 0.08, R, 0.0, 0.06, "CS_Gold", steps=96)
    ring_band(0.12, 0.2, 0.0, 0.06, "CS_Gold", steps=32)
    for m in range(8):
        a = 2 * math.pi * m / 8
        q = [wp(0.0, 0.0, 0.065), wp(0.13, a - 0.25, 0.065), wp(0.19, a, 0.065), wp(0.13, a + 0.25, 0.065)]
        flat(Wm, q, "CS_Gold" if m % 2 else "CS_Brass", (fwd[0], 0.0, fwd[1]))
    nodes.append({"name": "Prop_BigSixWheel", "mesh": Wm, "origin": (b["x"], hub + LIFT[0], b["z"]), "force": "CS_Sheen"})


def build_hall_baccarat(M, L, cushions):
    """The hall's kidney-shaped Punto Banco table beside the craps table: its players' curve toward
    the middle of the floor (uniform with the blackjack tables), Scarlett in the notch of its flat
    side toward the front rail; green baize with the PLAYER and BANKER boxes and each place's three
    betting spots, a padded rail round the curve, the chip rack, the shoe and the discard tray; five
    velvet stools. Authored with the curve toward +z; `face` -1 turns the whole table about (every
    offset from its centre turned by half a turn)."""
    t = L["hallBaccarat"]
    x, z, a, b = t["x"], t["z"], t["a"], t["b"]
    fz = t.get("face", 1)
    turn = 0.0 if fz > 0 else math.pi
    top = t["top"]

    def P(dx, dz):
        return (x + fz * dx, z + fz * dz)

    def outline(ia, ib, notch):
        # the players' curve, carried on round the ends toward the dealer
        pts = [P(ia * math.sin(math.radians(d)), ib * math.cos(math.radians(d))) for d in range(118, -119, -8)]
        # the dealer's side, bowed in to hold the dealer
        ex, ez = ia * math.sin(math.radians(118)), ib * math.cos(math.radians(118))
        for k in range(1, 12):
            u = 1 - 2 * k / 12
            pts.append(P(u * ex, ez + notch * (1 - u * u)))
        return pts

    o = outline(a, b, 0.33)
    i = outline(a - 0.12, b - 0.12, 0.33)
    for sx in (-0.55, 0.55):
        lx, lz = P(sx, 0.1)
        lathe(M, lx, lz, [(0, 0), (0.24, 0), (0.24, 0.04), (0.08, 0.1), (0.07, top - 0.16), (0.2, top - 0.1), (0, top - 0.1)], "CS_Mahogany", segs=14)
    slab(M, o, top - 0.1, top - 0.02, "CS_Mahogany")
    slab(M, i, top - 0.02, top, "CS_FeltNavy" if t.get("felt") == "navy" else "CS_Felt")
    arc_o = [P((a + 0.03) * math.sin(math.radians(d)), (b + 0.03) * math.cos(math.radians(d))) for d in range(-90, 91, 10)]
    arc_i = [P((a - 0.12) * math.sin(math.radians(d)), (b - 0.12) * math.cos(math.radians(d))) for d in range(-90, 91, 10)]
    band(M, arc_o, arc_i, top - 0.02, top + 0.05, "CS_Velvet", closed=False)

    # the felt's markings: the PLAYER and BANKER card boxes, and each place's three spots
    for sx, mat in ((-0.3, "CS_FeltLine"), (0.3, "CS_FeltRed")):
        (ax_, az_), (bx_, bz_) = P(sx - 0.17, 0.05), P(sx + 0.17, 0.25)
        frame_strips(M, min(ax_, bx_), max(ax_, bx_), min(az_, bz_), max(az_, bz_), 0.012, top, top + 0.003, mat)
    band(M, [P(0.95 * math.sin(math.radians(d)), 0.52 * math.cos(math.radians(d))) for d in range(-80, 81, 10)], [P(0.93 * math.sin(math.radians(d)), 0.5 * math.cos(math.radians(d))) for d in range(-80, 81, 10)], top, top + 0.003, "CS_FeltGold", closed=False)
    for deg in t["stoolAngles"]:
        r_ = math.radians(deg)
        for k, (rr, mat) in enumerate(((0.62, "CS_FeltRed"), (0.7, "CS_FeltLine"), (0.54, "CS_FeltGold"))):
            cx, cz = P(math.sin(r_) * a * rr, math.cos(r_) * b * rr)
            obox(M, cx, cz, r_ + turn, -0.025, 0.025, -0.06, 0.06, top, top + 0.003, mat)
    # the rack by the notch, the shoe and the discard tray either side of it
    rx_, rz_ = P(0.0, -0.02)
    obox(M, rx_, rz_, turn, -0.06, 0.06, -0.3, 0.3, top, top + 0.03, "CS_Black")
    for k, mat in enumerate(("CS_Red", "CS_Ivory", "CS_Gold", "CS_Black", "CS_Red", "CS_Ivory")):
        cx, cz = P(-0.25 + k * 0.1, -0.02)
        obox(M, cx, cz, turn, -0.05, 0.05, -0.04, 0.04, top + 0.03, top + 0.045, mat)
    sx_, sz_ = P(0.66, -0.22)
    obox(M, sx_, sz_, -0.3 + turn, -0.08, 0.08, -0.07, 0.07, top, top + 0.09, "CS_Mahogany")
    obox(M, sx_, sz_, -0.3 + turn, 0.08, 0.095, -0.055, 0.055, top + 0.01, top + 0.08, "CS_Card")
    dx_, dz_ = P(-0.66, -0.22)
    obox(M, dx_, dz_, 0.3 + turn, -0.07, 0.07, -0.06, 0.06, top, top + 0.02, "CS_Black")
    for sx in (-0.3, 0.3):
        for k in range(2):
            cx, cz = P(sx - 0.05 + k * 0.1, 0.14)
            obox(M, cx, cz, turn, -0.07, 0.07, -0.045, 0.045, top, top + 0.004, "CS_Card")
    seat = cushions["barStool"]["top"]
    for deg in t["stoolAngles"]:
        r_ = math.radians(deg)
        stool(M, *P(math.sin(r_) * t["stoolA"], math.cos(r_) * t["stoolB"]), seat)
    if t.get("beadRoad"):
        build_bead_road(M, t["beadRoad"])


# a Punto Banco bead road: the coups in columns, red for the Banker, blue for the Player, green for
# a tie (a fixed evening's run of them; the sign is decoration)
BEAD_ROAD = "BBPBTPPBBBPBPPTBBPBBPPPBBTPBPBBPPBPBBBTP"


def build_bead_road(M, br):
    """The bead-road sign beside the baccarat table: a slim digital board on a brass post, its LEDs
    in six rows (the last coups: red, blue, green), a gold header; lit on both faces, so the players
    and the room alike can read it."""
    F = Frame(br["x"], br["z"], br.get("yaw", 0.0))
    F.lathe(M, 0.0, 0.0, [(0, 0), (0.16, 0), (0.14, 0.04), (0, 0.05)], "CS_Brass", segs=12)
    F.cyl(M, (0.0, 0.04, 0.0), (0.0, 1.12, 0.0), 0.028, "CS_Brass", sides=8)
    w, y0, y1 = 0.3, 1.1, 1.52
    F.box(M, -w - 0.03, w + 0.03, y0 - 0.03, y1 + 0.08, -0.04, 0.04, "CS_Gold")
    F.box(M, -w, w, y0, y1, -0.045, 0.045, "CS_Screen")
    F.box(M, -w, w, y1, y1 + 0.06, -0.047, 0.047, "CS_Black")
    for k in range(5):
        F.blob(M, -w + 0.06 + k * (2 * w - 0.12) / 4, y1 + 0.03, 0.0, 0.012, 0.012, 0.05, "CS_Bulb", cuts=1)
    rows, cols = 6, 8
    cell = (2 * w - 0.06) / cols
    for c in range(cols):
        for r_ in range(rows):
            ch = BEAD_ROAD[(c * rows + r_) % len(BEAD_ROAD)]
            mat = {"B": "CS_LedRed", "P": "CS_LedBlue", "T": "CS_LedGreen"}[ch]
            lx = -w + 0.03 + cell * (c + 0.5)
            y = y1 - 0.035 - r_ * (y1 - y0 - 0.06) / rows
            for side in (-1, 1):
                F.blob(M, lx, y, side * 0.047, 0.018, 0.018, 0.006, mat, cuts=1)


def build_cocktails(M, L, cushions):
    """The high-top cocktail tables in the carpet beyond the craps ropes: a round black-marble top in
    a brass ring on a slim brass column and a weighted foot, a candle and a coupe on it, and a
    leather-topped stool either side."""
    ct = L["cocktails"]
    top, r = ct["top"], ct["r"]
    seat = cushions["barStool"]["top"]
    for t in ct["tables"]:
        x, z = t["x"], t["z"]
        lathe(M, x, z, [(0, 0), (0.26, 0), (0.24, 0.04), (0.06, 0.07), (0.035, 0.12), (0.03, top - 0.08), (0.07, top - 0.05), (0, top - 0.05)], "CS_Brass", segs=16)
        lathe(M, x, z, [(0, top - 0.05), (r, top - 0.05), (r + 0.01, top - 0.02), (r, top), (0, top)], "CS_MarbleDark", segs=24)
        band(M, circle(x, z, r + 0.015, 24), circle(x, z, r - 0.01, 24), top - 0.055, top + 0.005, "CS_Brass")
        lathe(M, x + 0.06, z - 0.05, [(0, 0), (0.035, 0), (0.035, 0.06), (0, 0.06)], "CS_JarGlass", segs=10, y0=top)
        blob(M, x + 0.06, top + 0.075, z - 0.05, 0.012, 0.022, 0.012, "CS_Flame", cuts=1)
        lathe(M, x - 0.08, z + 0.06, [(0, 0.0), (0.03, 0.0), (0.005, 0.01), (0.005, 0.07), (0.05, 0.1), (0.055, 0.12), (0, 0.12)], "CS_JarGlass", segs=10, y0=top)
        blob(M, x - 0.08, top + 0.11, z + 0.06, 0.04, 0.012, 0.04, "CS_Amber", cuts=1)
        for side in (-1, 1):
            leather_stool(M, x + side * ct["stoolR"], z, seat)


def leather_stool(M, x, z, seat_top):
    """A bar stool with a buttoned oxblood-leather seat: a brass foot, post and foot ring."""
    lathe(M, x, z, [(0, 0), (0.17, 0), (0.16, 0.03), (0, 0.035)], "CS_Brass", segs=14)
    cylinder(M, (x, 0.03, z), (x, seat_top - 0.07, z), 0.028, "CS_Brass", sides=8)
    ring = 8
    for k in range(ring):
        a0, a1 = 2 * math.pi * k / ring, 2 * math.pi * (k + 1) / ring
        cylinder(M, (x + 0.14 * math.cos(a0), 0.2, z + 0.14 * math.sin(a0)), (x + 0.14 * math.cos(a1), 0.2, z + 0.14 * math.sin(a1)), 0.012, "CS_Brass", sides=6)
    lathe(M, x, z, [(0, seat_top - 0.07), (0.19, seat_top - 0.07), (0.21, seat_top - 0.035), (0.19, seat_top), (0, seat_top)], "CS_Leather", segs=16)
    blob(M, x, seat_top + 0.002, z, 0.012, 0.004, 0.012, "CS_LeatherDark", cuts=1)
    lathe(M, x, z, [(0, seat_top - 0.08), (0.2, seat_top - 0.08), (0.2, seat_top - 0.065), (0, seat_top - 0.065)], "CS_Gold", segs=16)


def build_booths(M, L, cushions):
    """The emerald horseshoe booths either side of the stage's steps: deep-buttoned green leather on
    a black plinth with a brass kick, a rolled top along the curved back, and in each a low round
    cocktail table of glass on a brass pedestal (two coupes on it)."""
    bo = L["booths"]
    seat = cushions["chesterfield"]["top"]
    for bx, bz in bo["at"]:
        F = Frame(bx, bz, bo["yaw"])
        R = bo["r"]

        def arc(r, a0=100, a1=260, n=16):
            return [F.p(r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), 0.0, r * math.cos(math.radians(a0 + (a1 - a0) * k / n)))[::2] for k in range(n + 1)]

        band(M, arc(R - 0.05), arc(0.33), 0.0, 0.1, "CS_Black", closed=False)
        band(M, arc(R - 0.04), arc(R - 0.07), 0.02, 0.07, "CS_Brass", closed=False)
        band(M, arc(R - 0.12), arc(0.3), 0.1, seat, "CS_EmeraldLeather", closed=False)
        band(M, arc(R + 0.02, 92, 268), arc(R - 0.12, 92, 268), 0.1, 0.98, "CS_EmeraldLeather", closed=False)
        # the rolled top and the buttons on the back
        pts = arc(R - 0.05, 92, 268, 18)
        for (ax, az), (bx_, bz_) in zip(pts, pts[1:]):
            cylinder(M, (ax, 0.98, az), (bx_, 0.98, bz_), 0.065, "CS_EmeraldLeather", sides=8)
        for row in range(3):
            for k in range(11):
                ang = 104 + 152 * (k + (0.5 if row % 2 else 0)) / 11
                if ang > 256:
                    continue
                px_, _, pz_ = F.p((R - 0.125) * math.sin(math.radians(ang)), 0.0, (R - 0.125) * math.cos(math.radians(ang)))
                blob(M, px_, seat + 0.14 + row * 0.16, pz_, 0.013, 0.013, 0.013, "CS_EmeraldTuft", cuts=1)
        for k in range(8):
            ang = 108 + 144 * k / 7
            px_, _, pz_ = F.p((R - 0.2) * math.sin(math.radians(ang)), 0.0, (R - 0.2) * math.cos(math.radians(ang)))
            blob(M, px_, seat + 0.003, pz_, 0.012, 0.006, 0.012, "CS_EmeraldTuft", cuts=1)
        # the cocktail table: a brass pedestal, a glass top in a brass ring, two coupes
        lathe(M, bx, bz, [(0, 0), (0.16, 0), (0.15, 0.03), (0.03, 0.06), (0.025, 0.44), (0.05, 0.46), (0, 0.46)], "CS_Brass", segs=14)
        lathe(M, bx, bz, [(0, 0.46), (0.27, 0.46), (0.27, 0.48), (0, 0.48)], "CS_JarGlass", segs=24)
        band(M, circle(bx, bz, 0.28, 24), circle(bx, bz, 0.265, 24), 0.455, 0.485, "CS_Brass")
        for dx, dz in ((-0.08, 0.05), (0.09, -0.04)):
            lathe(M, bx + dx, bz + dz, [(0, 0.0), (0.03, 0.0), (0.005, 0.01), (0.005, 0.07), (0.05, 0.1), (0.055, 0.12), (0, 0.12)], "CS_JarGlass", segs=10, y0=0.48)
            blob(M, bx + dx, 0.48 + 0.11, bz + dz, 0.04, 0.012, 0.04, "CS_Amber", cuts=1)


# ---------------------------------------------------------------------------------------------
# the front rail (up on the lounge's dais and down its steps), the chandeliers


def build_rail(M, L):
    e = L["half"] - 0.1
    h = L["half"]
    lounge = stage(L, "lounge")
    ly = lounge["h"]
    x_top, x_foot = lounge["x1"], lounge["x1"] + lounge["depth"]
    runs = [
        [(e, L["cage"]["z1"] + 0.15, 0.0), (e, e, 0.0)],
        [(-h + 0.25, e, 0.0), (e, e, 0.0)],
    ]
    for run in runs:
        for (ax, az, ay), (bx, bz, by) in zip(run, run[1:]):
            cylinder(M, (ax, ay + 0.34, az), (bx, by + 0.34, bz), 0.03, "CS_Brass", sides=10)
            n = max(1, round(math.hypot(bx - ax, bz - az) / 1.3))
            for k in range(n + 1):
                t = k / n
                px, pz, py = ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t
                cylinder(M, (px, floor_y(L, px, pz), pz), (px, py + 0.34, pz), 0.022, "CS_Brass", sides=8)


def build_chandeliers(M, L):
    for cx, cy, cz in L["chandeliers"]:
        lathe(M, cx, cz, [(0, 0), (0.14, 0), (0.12, 0.03), (0, 0.04)], "CS_Brass", segs=14, y0=cy + 1.0)
        cylinder(M, (cx, cy + 0.45, cz), (cx, cy + 1.0, cz), 0.015, "CS_Brass", sides=6)
        lathe(M, cx, cz, [(0, -0.18), (0.05, -0.12), (0.09, 0.05), (0.05, 0.22), (0.08, 0.35), (0.03, 0.45), (0, 0.46)], "CS_Brass", segs=12, y0=cy)
        for rad, y, n, drop in ((0.55, cy + 0.08, 16, 0.07), (0.34, cy - 0.12, 10, 0.05)):
            for k in range(n):
                a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
                cylinder(M, (cx + rad * math.cos(a0), y, cz + rad * math.sin(a0)), (cx + rad * math.cos(a1), y, cz + rad * math.sin(a1)), 0.016, "CS_Brass", sides=6)
                am = (a0 + a1) / 2
                blob(M, cx + rad * math.cos(am), y - drop, cz + rad * math.sin(am), 0.022, 0.04, 0.022, "CS_Crystal", cuts=1)
        for k in range(6):
            a = 2 * math.pi * k / 6
            cylinder(M, (cx, cy + 0.1, cz), (cx + 0.55 * math.cos(a), cy + 0.08, cz + 0.55 * math.sin(a)), 0.014, "CS_Brass", sides=6)
            cylinder(M, (cx + 0.55 * math.cos(a), cy + 0.08, cz + 0.55 * math.sin(a)), (cx + 0.55 * math.cos(a), cy + 0.2, cz + 0.55 * math.sin(a)), 0.02, "CS_Ivory", sides=6)
            blob(M, cx + 0.55 * math.cos(a), cy + 0.25, cz + 0.55 * math.sin(a), 0.03, 0.05, 0.03, "CS_Crystal", cuts=1)
        blob(M, cx, cy - 0.26, cz, 0.05, 0.09, 0.05, "CS_Crystal", cuts=2)


# ---------------------------------------------------------------------------------------------


def build(root):
    purge()
    L = read_layout(root)
    cushions = read_cushions(root)
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    M = Mesh()
    M.lit = True
    nodes = []
    face = wall_face(L)
    lounge_h = stage(L, "lounge")["h"]
    # what stands against the walls (no damask behind it), and where the light falls
    WALL_FEATURES.clear()
    d = L["doors"]
    vd = L["vipDoors"]
    WALL_FEATURES.extend([
        ("z", d["x"] - d["w"] / 2 - 0.25, d["x"] + d["w"] / 2 + 0.25, 0.0, 9.0),
        ("z", vd["x"] - vd["w"] / 2 - 0.35, vd["x"] + vd["w"] / 2 + 0.35, 0.0, 9.0),
        ("z", L["cage"]["x0"] - 0.1, 10.0, 0.0, 3.3),
        ("z", L["marquee"]["x"] - L["marquee"]["w"] / 2 - 0.1, L["marquee"]["x"] + L["marquee"]["w"] / 2 + 0.1, L["marquee"]["y"] - L["marquee"]["h"] / 2 - 0.1, 9.0),
        ("z", L["zara"]["x"] - 0.8, L["zara"]["x"] + 0.8, 0.0, L["zara"]["h"] + 0.1),
        ("x", L["bar"]["z0"] - 0.2, L["bar"]["z1"] + 0.1, 0.0, 3.35),
        ("x", L["neon"]["from"] - 0.3, L["neon"]["to"] + 0.3, 0.0, L["neon"]["y"] + 0.55),
        ("x", L["bigSix"]["z"] - 0.98, L["bigSix"]["z"] + 0.98, 0.0, lounge_h + L["bigSix"]["hub"] + L["bigSix"]["r"] + 0.75),
    ])
    for m in L["mirrors"]:
        WALL_FEATURES.append((m["wall"], m["at"] - 0.7, m["at"] + 0.7, m["y"] - 0.7, m["y"] + 0.7))
    pictures = []
    for p in L["paintings"] + L["posters"]:
        w_, h_ = (p.get("w", 0.9), p.get("h", 0.8)) if "subject" in p else (p.get("w", 0.6), p.get("h", 0.86))
        WALL_FEATURES.append((p["wall"], p["at"] - w_ / 2 - 0.2, p["at"] + w_ / 2 + 0.2, p["y"] - h_ / 2 - 0.2, p["y"] + h_ / 2 + 0.5))
        if p.get("light", True):
            pictures.append((p["wall"], p["at"], p["y"] + h_ / 2, w_ / 2))
    sconces = []
    for wall, key in (("z", "onBackZ"), ("x", "onBackX")):
        for u in L["sconces"][key]:
            fl = floor_y(L, u, face + 0.3) if wall == "z" else floor_y(L, face + 0.3, u)
            sconces.append((wall, u, L["sconces"]["y"] + fl))
            WALL_FEATURES.append((wall, u - 0.25, u + 0.25, L["sconces"]["y"] + fl - 0.45, L["sconces"]["y"] + fl + 0.45))
    LIGHTS.clear()
    LIGHTS.extend([wall_lights(L, sconces, pictures), neon_reflection(L)])
    build_floor(M, L)
    build_dividers(M, L)
    build_stages(M, L)
    build_walls(M, L)
    build_marquee(M, L, nodes)
    for p in L["paintings"]:
        build_portrait(M, L, p)
    for p in L["posters"]:
        build_poster(M, L, p)
    for p in L["mirrors"]:
        build_mirror(M, L, p)
    build_pillars(M, L)
    build_cage(M, L)
    build_foyer(M, L, cushions)
    build_zara(M, L, nodes)
    build_gachapon(M, L)
    build_roulette(M, L)
    build_craps(M, L, nodes)
    build_craps_ropes(M, L)
    build_cocktails(M, L, cushions)
    build_blackjack(M, L, cushions)
    build_hall_baccarat(M, L, cushions)
    build_booths(M, L, cushions)
    build_billiards(M, L, nodes)
    build_alley(M, L)
    build_pinballs(M, L)
    build_derby(M, L, nodes)
    build_pusher(M, L, nodes)
    build_pusher(M, L, nodes, key="pusherHigh", node="Prop_PusherPlateHigh", high=True)
    with lifted(stage(L, "pit")["h"]):
        build_pit(M, L, cushions, nodes)
    with lifted(stage(L, "lounge")["h"]):
        build_lounge(M, L, cushions, nodes)
    build_rail(M, L)
    build_chandeliers(M, L)
    make_object("Casino_Static", M, coll)
    wheel, origin = build_wheel(L)
    make_object("Prop_RouletteWheel", wheel, coll, origin=origin, force="CS_Sheen")
    keyed = {}
    for n in nodes:
        parent = keyed.get(n.get("parent")) if n.get("parent") else None
        ob = make_object(n["name"], n["mesh"], coll, origin=n["origin"], force=n.get("force"), parent=parent, recalc=n.get("recalc", True), coloured=n.get("coloured", True))
        if n.get("key"):
            keyed[n["key"]] = ob
    return coll, L, cushions


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


def summary(coll, L, cushions):
    out = {}
    for o in coll.all_objects:
        ws = [o.matrix_world @ v.co for v in o.data.vertices]
        lo = [min(w[k] for w in ws) for k in range(3)]
        hi = [max(w[k] for w in ws) for k in range(3)]
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "x": [round(lo[0], 3), round(hi[0], 3)], "y": [round(lo[2], 3), round(hi[2], 3)], "z": [round(-hi[1], 3), round(-lo[1], 3)], "materials": [m.name for m in o.data.materials]}
    return {
        "objects": out,
        "checks": {
            "drawCalls": sum(len(v["materials"]) for v in out.values()),
            "tris": sum(v["tris"] for v in out.values()),
            "seatTops": {k: v["top"] for k, v in cushions.items()},
        },
    }


def main():
    report = globals().get("REPORT_PATH")
    try:
        root = repo_root()
        studio(root, "begin")
        coll, L, cushions = build(root)
        out = os.path.join(root, "client", "public", "models", "casino.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        result = {"ok": True, "glb": out, "bytes": os.path.getsize(out), **summary(coll, L, cushions)}
        result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
