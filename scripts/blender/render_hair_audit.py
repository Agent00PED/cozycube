"""The hair catalogue audit: every hair style, four angles each, on one contact sheet.

The fancy styles cost coins in the game, so this is how to look at all of them without earning
anything first. Run it in Blender after build_avatar.py (the Avatar collection must be in the
scene), either through the Live Bridge:

    curl -X POST http://127.0.0.1:8192 --data-binary @scripts/blender/render_hair_audit.py

or headless, straight after a build:

    blender -b -P scripts/blender/build_avatar.py -P scripts/blender/render_hair_audit.py

It writes client/public/renders/hair_catalog_audit.png: one row per style, in catalogue order, from
the front, the front three-quarter, the side and the rear three-quarter, each tile labelled with
the style's name and price. The avatar wears the starter hoodie and no hat; a style that covers the
ears is shown with them hidden, and a raised part (a tail, buns, a knot) shown, as in the game.

The catalogue (order, names, prices) is read from shared/types.ts and the ear flags from
client/src/entities/rig.ts, so the sheet always matches what the wardrobe sells. As with the build
script, define REPO_ROOT (and optionally REPORT_PATH) in front of the body to point it somewhere.
"""

import json
import math
import os
import re
import tempfile
import traceback

import bpy
import numpy as np
from mathutils import Vector

COLLECTION = "Avatar"
PREFIX = "AV_"
TOP, BOTTOM = "hoodie", "sweats"
# (label, yaw in degrees round from the front, pitch in degrees up)
VIEWS = (("Front", 0, 4), ("Front 3/4", 45, 8), ("Profile", 90, 4), ("Rear 3/4", 135, 8))
TILE = 300
ORTHO = 0.98  # the camera's view width: the head and shoulders, with room for the longest hair
TARGET = Vector((0, 0, 0.76))
BACKGROUND = (0.13, 0.13, 0.15)
LABEL = (0.95, 0.93, 0.88, 1.0)


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("render_hair_audit.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


def catalogue(root):
    """[(style, name, price)] in the wardrobe's order, from shared/types.ts."""
    src = open(os.path.join(root, "shared", "types.ts"), encoding="utf-8").read()
    order = re.findall(r'"(\w+)"', re.search(r"export const HAIR_STYLES = \[(.*?)\]", src).group(1))
    table = re.search(r"export const HAIR_DEFINITIONS[^=]*= \{(.*?)\n\};", src, re.S).group(1)
    defs = {m[0]: (m[1], int(m[2])) for m in re.findall(r'(\w+): \{ name: "([^"]*)", emoji: "[^"]*", price: (\d+) \}', table)}
    return [(s, *defs[s]) for s in order]


def covering(root):
    """The styles that cover the ears, from rig.ts's HAIR_STYLE_META."""
    src = open(os.path.join(root, "client", "src", "entities", "rig.ts"), encoding="utf-8").read()
    table = re.search(r"HAIR_STYLE_META:.*?= \{(.*?)\n\};", src, re.S).group(1)
    return set(re.findall(r"(\w+): \{ coversEars: true \}", table))


def dress(objects, style, hide_ears):
    """Show the one style (and its raised part), the starter outfit, no hat, no mug."""
    for o in objects:
        name = o.name[len(PREFIX) :]
        kind, _, rest = name.partition("_")
        if kind == "Hair":
            show = rest in (style, style + "_Prop")
        elif kind == "Top":
            show = rest.split("_")[0] == TOP
        elif kind == "Bottom":
            show = rest.split("_")[0] == BOTTOM
        elif kind == "Hat" or name == "Mug":
            show = False
        elif name in ("EarL", "EarR"):
            show = not hide_ears
        else:
            show = True
        o.hide_render = not show


def label_material():
    mat = bpy.data.materials.get("TMP_AuditLabel") or bpy.data.materials.new("TMP_AuditLabel")
    mat.diffuse_color = LABEL
    return mat


def render_sheet(root):
    sc = bpy.context.scene
    av = bpy.data.collections[COLLECTION]
    objects = [o for o in av.all_objects]
    styles = catalogue(root)
    covers = covering(root)
    missing = [s for s, _, _ in styles if PREFIX + f"Hair_{s}" not in bpy.data.objects]
    if missing:
        raise RuntimeError(f"the scene's avatar has no hair for {missing}: run build_avatar.py first")

    saved = {
        "objects": {o.name: o.hide_render for o in objects},
        "collections": {c.name: c.hide_render for c in bpy.data.collections},
        "scene": (sc.render.engine, sc.camera, sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath, sc.render.film_transparent),
        "world": tuple(sc.world.color) if sc.world else None,
    }
    for c in bpy.data.collections:
        if c.name != COLLECTION:
            c.hide_render = True
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.cavity_type = "WORLD"
    sh.show_shadows = False
    sc.render.resolution_x = sc.render.resolution_y = TILE
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new("TMP_AuditWorld")
    sc.world.color = BACKGROUND

    cam_data = bpy.data.cameras.new("TMP_AuditCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ORTHO
    cam = bpy.data.objects.new("TMP_AuditCam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # the labels ride on the camera, top left of the frame, always facing it
    font = bpy.data.curves.new("TMP_AuditLabel", "FONT")
    font.size = 0.036
    label = bpy.data.objects.new("TMP_AuditLabel", font)
    label.data.materials.append(label_material())
    sc.collection.objects.link(label)
    label.parent = cam
    label.location = (-ORTHO / 2 + 0.02, ORTHO / 2 - 0.05, -1.0)

    tmp = tempfile.mkdtemp(prefix="hair_audit_")
    canvas = np.zeros((TILE * len(styles), TILE * len(VIEWS), 4), dtype=np.float32)
    try:
        for row, (style, name, price) in enumerate(styles):
            dress(objects, style, style in covers)
            for col, (view, yaw, pitch) in enumerate(VIEWS):
                y, p = math.radians(yaw), math.radians(pitch)
                d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
                cam.location = TARGET + d * 5
                cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
                font.body = f"{name}  ·  {'Free' if price == 0 else f'{price} coins'}\n{view}"
                path = os.path.join(tmp, f"{style}_{col}.png")
                sc.render.filepath = path
                bpy.ops.render.render(write_still=True)
                img = bpy.data.images.load(path)
                px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE, TILE, 4)  # bottom row first
                bpy.data.images.remove(img)
                top = (len(styles) - 1 - row) * TILE
                canvas[top : top + TILE, col * TILE : (col + 1) * TILE] = px
    finally:
        bpy.data.objects.remove(label)
        bpy.data.curves.remove(font)
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cam_data)
        for o in objects:
            o.hide_render = saved["objects"][o.name]
        for c in bpy.data.collections:
            if c.name in saved["collections"]:
                c.hide_render = saved["collections"][c.name]
        sc.render.engine, sc.camera, sc.render.resolution_x, sc.render.resolution_y, sc.render.filepath, sc.render.film_transparent = saved["scene"]
        if saved["world"] is not None:
            sc.world.color = saved["world"]

    out = os.path.join(root, "client", "public", "renders", "hair_catalog_audit.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet = bpy.data.images.new("TMP_HairAudit", TILE * len(VIEWS), TILE * len(styles), alpha=False)
    sheet.pixels.foreach_set(canvas.ravel())
    sheet.filepath_raw = out
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)
    return {"ok": True, "png": out, "bytes": os.path.getsize(out), "styles": [s for s, _, _ in styles], "covers_ears": sorted(covers), "views": [v for v, _, _ in VIEWS]}


def main():
    report = globals().get("REPORT_PATH")
    try:
        result = render_sheet(repo_root())
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
