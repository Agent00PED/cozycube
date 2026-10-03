"""The Blender studio: every builder's work laid out on one grid, in one master file.

Each builder exports its GLB with its model where the game expects it (at the origin), then hands
its collections here (`finish`), which moves their root objects to their place on the grid, files
them under their world's collection and saves the .blend. A builder runs this file fresh from disk
every time (exec, never import), so a long-lived Live Bridge session always runs it as it is now.

    Studio_Lounge     (0, 0)    the lounge's small props, Mochi, Chloe and her mirror
    Studio_Campfire   (40, 0)   the Campfire diorama; Barnaby and Buster in front of it
    Studio_Casino     (80, 0)   the Velvet Casino and its penthouse (at its place beside the hall);
                                Mr. Vance, the staff and the patrons in a line in front of it
    Studio_Forest     (120, 0)  the Whispering Woods diorama; Bramble the bear and the fish (every
                                species on its stand, in rows) in front of it, and the wild
                                critters (the rabbit, the squirrel and the deer) beside Bramble
    Studio_Boxing     (160, 0)  the Velvet Ring; the boxing gloves and Coach Bruno in front of it
    Studio_Caverns    (212, 0)  the Glimmering Caverns (clear of the Velvet Ring's line of regulars);
                                Gus the Mole in front of it (Old Flint, who
                                keeps the way down, stands with the Forest's folk)
    Studio_Beach      (270, 0)  Sunset Beach (and, in front of it, its folk and its two maps under it)
    Studio_Wardrobe   (0, 30)   the avatar in every outfit (client/src/entities/rig.ts
                                OUTFIT_PARTS), 2 m apart along x: the built rig first (the starter
                                hoodie), then a linked copy per outfit (its meshes shared)

Blender's axes: x to the right, y away from the front view, z up (the game's z is Blender's -y).

A headless run with no file open (`blender -b --factory-startup -P ...`) first opens the master
file if there is one (`begin`), so the grid fills up across builders; every builder purges only
its own collections, so what the others left stays. Saved to the file open in the session, or to
the master: models/master_world.blend under the repository (kept out of git).
"""

import os
import re

import bpy
from mathutils import Vector

MASTER = os.path.join("models", "master_world.blend")
WORLDS = {"Lounge": (0.0, 0.0), "Campfire": (40.0, 0.0), "Casino": (80.0, 0.0), "Forest": (120.0, 0.0), "Boxing": (160.0, 0.0), "Caverns": (212.0, 0.0), "Beach": (270.0, 0.0), "Wardrobe": (0.0, 30.0)}
WARDROBE_STEP = 2.0
# Where each builder's collections go: their world, and either "world" (the diorama's own origin on
# the world's corner of the grid) or the point their bounding box is centred on, from the world's.
PLACES = {
    "Props": ("Lounge", (0.0, 0.0)),
    "Mochi": ("Lounge", (-3.0, -4.0)),
    "ChloeMaid": ("Lounge", (3.0, -4.0)),
    "Campfire": ("Campfire", "world"),
    "Barnaby": ("Campfire", (-3.5, -15.0)),
    "Buster": ("Campfire", (3.5, -15.0)),
    "Casino": ("Casino", "world"),
    "CasinoVip": ("Casino", "world"),
    "Vance": ("Casino", (-13.5, -14.0)),
    "Patrons": ("Casino", (0.0, -19.0)),
    "Avatar": ("Wardrobe", "world"),
    "Forest": ("Forest", "world"),
    "Beach": ("Beach", "world"),
    "Mango": ("Beach", (-3.0, -22.0)),
    "Dune": ("Beach", (0.0, -22.0)),
    "Brine": ("Beach", (3.0, -22.0)),
    "Bramble": ("Forest", (-4.0, -16.0)),
    "Fish": ("Forest", (5.0, -17.0)),
    "Critters": ("Forest", (-9.0, -16.0)),
    "BoxingRing": ("Boxing", "world"),
    "BoxingGloves": ("Boxing", (-3.0, -14.0)),
    "CoachBruno": ("Boxing", (1.0, -14.0)),
    "RingFan_Raccoon": ("Boxing", (3.0, -14.0)),
    "RingFan_Rabbit": ("Boxing", (5.0, -14.0)),
    "BagBoxer": ("Boxing", (7.0, -14.0)),
    "RingCrowd": ("Boxing", (11.0, -14.0)),
    "Referee": ("Boxing", (15.0, -14.0)),
    "Trainee": ("Boxing", (17.0, -14.0)),
    "Caverns": ("Caverns", "world"),
    "Gus": ("Caverns", (-3.0, -26.0)),
    "Finnegan": ("Caverns", (0.0, -26.0)),
    "Capybara": ("Caverns", (3.0, -26.0)),
    "OldFlint": ("Forest", (-12.5, -16.0)),
}
# The casino's staff and regulars (build_casino_staff.py), in a line after Mr. Vance.
for _k, _name in enumerate(("Boris", "Vivienne", "Jasper", "Pippin", "Bruno", "Cedric", "Gideon", "Scarlett", "Baron", "Penelope")):
    PLACES[_name] = ("Casino", (-11.0 + _k * 2.5, -14.0))
# The avatar's nodes shown only on demand (build_avatar.py is_variant): held props and the happy eyes.
HELD = ("Mug", "WateringCan", "EyesHappy", "Skewer", "FishingRod", "RodTip", "Guitar", "Bobber", "Hatchet", "Pickaxe", "SmithHammer", "Chisel", "Net", "FireflyJar", "Heart")


def master_path(root):
    return os.path.join(root, MASTER)


def begin(root):
    """Before a build: a headless run with no file open picks up the master file, so this
    builder's work joins the others'."""
    if not bpy.app.background or bpy.data.filepath:
        return {"opened": None}
    path = master_path(root)
    if os.path.exists(path):
        bpy.ops.wm.open_mainfile(filepath=path)
        return {"opened": path}
    # a new master: without the factory scene's cube
    cube = bpy.data.objects.get("Cube")
    if cube is not None and cube.type == "MESH" and len(cube.data.vertices) == 8:
        bpy.data.objects.remove(cube, do_unlink=True)
    return {"opened": None}


def _studio_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    scene = bpy.context.scene.collection
    if coll.name not in scene.children:
        scene.children.link(coll)
    return coll


def _file_under(coll, parent):
    """Moves a collection from wherever it is linked to under `parent`."""
    for owner in [bpy.context.scene.collection, *bpy.data.collections]:
        if owner is not parent and coll.name in owner.children:
            owner.children.unlink(coll)
    if coll.name not in parent.children:
        parent.children.link(coll)


def _roots(coll):
    return [o for o in coll.all_objects if o.parent is None]


def _centre_xy(coll):
    bpy.context.view_layer.update()
    lo = [float("inf")] * 2
    hi = [float("-inf")] * 2
    for o in coll.all_objects:
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for k in range(2):
                lo[k] = min(lo[k], w[k])
                hi[k] = max(hi[k], w[k])
    if lo[0] == float("inf"):
        return (0.0, 0.0)
    return ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2)


def _move(coll, dx, dy):
    for o in _roots(coll):
        o.location.x += dx
        o.location.y += dy


def _bare(name):
    """A node's name without the builder's prefix ("AV_") and Blender's ".001" suffix."""
    name = re.sub(r"\.\d{3,}$", "", name)
    return name[3:] if name.startswith("AV_") else name


def _wardrobe_keep(name, top, bottom):
    kind, _, rest = name.partition("_")
    want = {"Hair": "short", "Top": top, "Bottom": bottom}.get(kind)
    if want is not None:
        return rest.split("_")[0] == want
    return kind != "Hat" and not name.startswith(HELD)


def _wardrobe(root, avatar, parent):
    """The avatar in every outfit along the wardrobe row: linked copies of the built rig (its
    meshes shared, so the row costs next to nothing), each showing one outfit."""
    old = bpy.data.collections.get("Wardrobe_Outfits")
    if old is not None:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    row = bpy.data.collections.new("Wardrobe_Outfits")
    parent.children.link(row)
    src = open(os.path.join(root, "client", "src", "entities", "rig.ts"), encoding="utf-8").read()
    outfits = re.findall(r'(outfit_\w+): \{ top: "(\w+)", bottom: "(\w+)" \}', src)
    rig_root = next((o for o in _roots(avatar) if _bare(o.name) == "Root"), None)
    if rig_root is None or not outfits:
        return 0

    def copy(ob, into_parent, top, bottom, label):
        c = ob.copy()
        c.name = f"{label}_{_bare(ob.name)}"
        row.objects.link(c)
        if into_parent is not None:
            c.parent = into_parent
            c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        c.hide_viewport = False
        c.hide_render = False
        for ch in ob.children:
            if _wardrobe_keep(_bare(ch.name), top, bottom):
                copy(ch, c, top, bottom, label)
        return c

    made = 0
    # the built rig is the row's first outfit (its default look); a copy for each of the others
    for i, (oid, top, bottom) in enumerate(outfits[1:], start=1):
        c = copy(rig_root, None, top, bottom, oid.replace("outfit_", "OF_"))
        c.location = rig_root.location.copy()
        c.location.x += i * WARDROBE_STEP
        made += 1
    return made


def finish(root, colls):
    """After the export: each collection to its place on the grid, filed under its world, and the
    .blend saved."""
    placed = {}
    for coll in colls:
        world, where = PLACES.get(coll.name, ("Lounge", (0.0, 8.0)))
        bx, by = WORLDS[world]
        parent = _studio_collection(f"Studio_{world}")
        _file_under(coll, parent)
        if where == "world":
            _move(coll, bx, by)
        else:
            cx, cy = _centre_xy(coll)
            _move(coll, bx + where[0] - cx, by + where[1] - cy)
        placed[coll.name] = world
        if coll.name == "Avatar":
            placed["outfits"] = _wardrobe(root, coll, parent) + 1
    path = bpy.data.filepath or master_path(root)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return {"placed": placed, "saved": path}
