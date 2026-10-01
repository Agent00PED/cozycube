"""The Glimmering Caverns diorama: builds client/public/models/caverns.glb. This is the BLOCKOUT
(phase 1 of docs/caverns-design.md): every zone's ground in its own flat colour, its cliffs darker, the
trails worn pale, the water, the pools and the stream as plain surfaces; the Basalt Crucible Forge's
alcove, Gus's camp and the adit as they were; with phase 2's structure: the walls' bedding, the
jungle's broken rim and the Great Wall's flowstone, every cliff dressed as rock, the terraces'
rimstone lips, the trails' edges and the map's rim. The zones' own rock, plants and light come in the
later phases, one zone at a time.

Run it inside Blender through the Live Bridge (POST {"code": ...}: run this file inside a namespace
of its own with REPO_ROOT and REPORT_PATH set in it; the summary or the traceback goes to
REPORT_PATH), or headless:

    npm run caverns-terrain
    blender -b --factory-startup -P scripts/blender/build_caverns.py

(CAVERNS_NO_STUDIO=1 for a trial that neither opens nor saves the studio's master file, CAVERNS_OUT
for somewhere else to write the .glb.) It only ever touches its own "Caverns" collection
(`clean_caverns_collection`: that collection's objects and the meshes they alone used, at the
studio's X = 212; no select_all, nothing of the Velvet Ring's, the Forest's or any other world's);
the export takes only this collection's objects.

Nothing is placed by hand. Where everything stands comes from CAVERNS_LAYOUT in
shared/worlds/caverns.ts (the JSON between its layout markers, read as is), and the ground itself
from the very grid the game walks: scripts/blender/data/caverns_terrain.json (`npm run
caverns-terrain` writes it from caverns.ts; `npm run check-layout` fails while it is stale), each
vertex with its zone's surface (caverns.ts SURFACE).

The builder is in parts (docs/caverns-roadmap.md phase 7): this file lays the world out in order
(`build_world`), then exports and packs it; the package beside it, scripts/blender/caverns/, holds
the parts, one module a system (kit: the palette, the files read, noise, the mesh and its
primitives, the light painted in; scene: Blender's side; ground, walls, rims, waters, rocks,
templates, pack) or a zone (zone_basecamp, zone_jungle, zone_breakdown, zone_mudflats,
zone_terraces, zone_lake, zone_rift, zone_overlook).

The world, one function each:

    build_terrain            the floor: a subdivided grid displaced to the walk grid, which is the
                             game's click collider too (caverns_walk_collider), each zone's ground its
                             own colour (a trail's the ground it is cut into: the game draws the trodden
                             way, client/src/scene/caveSurface.ts); its edge carried down to -2.5 m
                             all round (the pedestal's skirt)
    build_walls / build_adit the north and west limestone cliffs, leaning back (nothing overhangs),
                             stepped by their bedding (`wall_bed`), broken off in blocks over the
                             jungle (the collapse), the Great Wall's flowstone folds behind the
                             terraces, rust bleeding down over the mudflats, fractured over the
                             breakdown; hollowed round the nodes set in them; the adit's bore and timbers
    build_vault_lip          the vault's broken lip along the walls' tops, stalactites hanging from it
    build_cliff_faces        every cliff between two levels dressed as rock over its slope (traced
                             from the layout's own rims): strata, rust-stained bluffs, the terraces'
                             rimstone gours, the crystal wall's dark basalt over the rift
    build_terrace_lips       a rimstone lip round every warm pool
    build_trail_edges        the rope descent's stakes and rope, stones lining the trails across the
                             cliffs, a cairn at each trail's end
    build_rim                low broken rock along the open south and east edges, the lake's outflow
                             falling over the rim
    phase 3, each zone's own (zone_ground paints each zone's ground over its flat colour):
    build_jungle             the Garden of Edam's tall thin trees (dithered), ferns, vines down the
                             collapse's walls
    build_basecamp_gear      the barrels, the crate stack, the bedroll, the survey board, lantern posts
    build_breakdown          fallen tabular slabs with coal in their beds, gravel
    build_mudflats           the mud's dried plates cracked apart, ochre puddles
    build_pearl_basins       dry rimstone basins with cave pearls on the terraces' apron
    build_lake_shore         reeds and pebbles at the waterline, the islet's crag
    build_rift_decor         basalt stubs, fungi, glowworms up the crystal wall
    build_overlook           the Hound's Hand (its crown in lobes, a paw) and the plateau's stalagmites
    build_camp               Gus's Expedition Basecamp
    build_forge_alcove       the Basalt Crucible Forge, the flagstones, the Geode Anvil, the chisel
                             rack and the tool crate (carried over exactly as they were built)
    build_waters             the Great Lake's surface, the terraces' three warm pools (their seats
                             under the water), the stream's ribbon (its falls where it crosses a cliff),
                             the jungle's plunge pool and the waterfall into it
    build_blockout_rocks     the boulders, the host rock behind every node that stands free, the
                             rift's crystals and fungi, each in its zone's colour
    build_hounds_hand        the giant stalagmite on the overlook (dithered in front of the camera)
    build_winch              Gus's winch lift at the breakdown's edge, its rope down to the rift
    build_causeway           the stepping stones out to the Monolith's islet

One mesh per finish:

    caverns_walk_collider  CV_Clay          the floor and its skirt
    Cave_Rock              CV_Clay          every rock, the camp, the forge, the adit, the winch, the
                                            causeway's stones
    Cave_Shell             CV_Shell         the north and west walls; double sided
    Cave_Roots             CV_Occluder      the Hound's Hand and the jungle's trees (dithered in front of
                                            the camera)
    Cave_Glow              CV_Glow          crystals, fungi, lanterns, the forge's fire and runes
    Cave_Water             CV_Water         the lake, the stream, the plunge pool, the falls, the
                                            quench trough
    Cave_Thermal           CV_ThermalWater  the pools' warm water

Every face's colour alpha says whether it is natural (1) or made or grown (0: the `PLAIN` colours),
for the game's surface detail; every natural corner is paler and every crevice darker
(`vertex_wear`).

and the templates the game instances: the ore nodes' rocks (Ore_<kind>, Ore_<kind>_Glow, Ore_Rubble:
phase 4's minerals, each its own and dark against its zone's ground: `ore_coal` a black boulder of
glossy lumps, `ore_copper` limestone crusted with verdigris and faceted native copper chunks,
`ore_iron` banded iron striped with red jasper and specularite plates, `ore_silver` dark argentite
veined white with shining silver wire, `ore_glimmer` a great crystal and its crown; their glints set
on the rock's own skin by a ray from its centre, `surface_point`),
the glowing cave crab and the swiftlet (Fauna_Crab, Fauna_Swift). The export is packed
(`quantize_glb`, KHR_mesh_quantization).

Coordinates: the game's (x, y up, z) is Blender's (x, -z, y); `W` converts.
"""

import json
import os
import random
import sys
import traceback

import bpy


def repo_root():
    root = globals().get("REPO_ROOT")
    if root:
        return root
    if "__file__" in globals() and __file__.endswith("build_caverns.py"):
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.environ.get("COZYCUBE_ROOT", os.getcwd())


# The builder's parts, one module a system or a zone (scripts/blender/caverns/: docs/caverns-roadmap.md
# phase 7), imported afresh on every run (the Live Bridge's Blender keeps modules between runs).
_PARTS = os.path.join(repo_root(), "scripts", "blender")
if _PARTS not in sys.path:
    sys.path.insert(0, _PARTS)
for _name in [n for n in sys.modules if n == "caverns" or n.startswith("caverns.")]:
    del sys.modules[_name]
from caverns.ground import build_terrain, Ground
from caverns.kit import (
    add_light, GEO_STATS, LIGHTS, Mesh, ORE_RADII, read_layout, read_ore_radii, read_terrain,
    read_thermal_ledge,
)
from caverns.pack import quantize_glb
from meshopt_pack import meshopt_pack
from caverns.rims import build_cliff_faces, build_far_passage, build_rim, build_terrace_lips, build_trail_edges
from caverns.rocks import build_blockout_rocks, build_dressing
from caverns.scene import clean_caverns_collection, finish_object, studio
from caverns.templates import build_fauna_templates, build_ores
from caverns.walls import build_adit, build_vault_lip, build_walls
from caverns.waters import build_waters, pool_y_at
from caverns.zone_basecamp import build_basecamp_gear, build_camp, build_forge_alcove, build_winch
from caverns.zone_breakdown import build_breakdown
from caverns.zone_jungle import build_jungle
from caverns.zone_lake import build_causeway, build_lake_shore, build_raft, build_monolith_dais
from caverns.zone_mudflats import build_bats, build_mudflats
from caverns.zone_overlook import build_overlook
from caverns.zone_rift import build_rift_decor
from caverns.zone_terraces import build_pearl_basins, build_unreached


# ---------------------------------------------------------------------------------------------
# the world


def build_world(G, L, coll, ledge_top):
    half = L["half"]
    floor = Mesh("CV_Clay")
    rock = Mesh("CV_Clay")
    glow = Mesh("CV_Glow")
    shell = Mesh("CV_Shell")
    roots = Mesh("CV_Occluder")
    water = Mesh("CV_Water")
    therm = Mesh("CV_ThermalWater")
    lt, Cp, F = L["lights"], L["camp"], L["forge"]

    # the light painted in: the lamps and the fires (the layout's lights stand that high over what is
    # under them)
    add_light(lt["forge"][0], G.y(lt["forge"][0], lt["forge"][2]) + lt["forge"][1], lt["forge"][2], "#FF8A3A", 1.4, 6.0)
    add_light(F["x"], G.y(F["x"], F["z"] + 1.2) + 1.1, F["z"] + 0.1, "#FF5A1F", 1.2, 3.2)
    add_light(F["x"], G.y(F["x"], F["z"] + 1.2) + 0.5, F["z"] + 1.0, "#FF7A2F", 1.0, 2.6)
    add_light(lt["thermal"][0], pool_y_at(L, lt["thermal"][0], lt["thermal"][2]) + lt["thermal"][1], lt["thermal"][2], "#FFE9C4", 1.1, 7.0)
    add_light(lt["cenote"][0], L["lake"]["water"] + lt["cenote"][1], lt["cenote"][2], "#35E6FF", 0.9, 8.0)
    add_light((Cp["posts"][0][0] + Cp["posts"][1][0]) / 2, G.y(L["workstation"]["x"], L["workstation"]["z"]) + 2.2, Cp["posts"][0][1], "#FFB347", 1.4, 5.0)
    add_light(L["adit"]["x"] + 0.7, G.y(L["adit"]["x"], -half + 1.5) + 2.0, L["adit"]["z"] + 0.9, "#FFB347", 1.2, 4.5)
    add_light(L["finnegan"]["x"] + 0.7, G.y(L["finnegan"]["x"], L["finnegan"]["z"]) + 0.5, L["finnegan"]["z"] + 0.3, "#FFB347", 1.0, 4.0)
    add_light(L["winch"]["x"], G.y(L["winch"]["x"], L["winch"]["top"]) + 2.2, L["winch"]["top"], "#FFB347", 1.0, 4.0)
    for x, z, s in L["crystals"]:
        add_light(x, G.y(x, z) + 0.5 * s, z, "#00F5D4", 0.3 * s, 1.1 * s)
    for x, z, kind, _ in L["campProps"]:
        if kind == "post":
            add_light(x + 0.42, G.y(x, z) + 1.75, z, "#FFB347", 1.1, 3.6)

    build_terrain(G, L, floor)
    build_walls(G, L, shell, glow, random.Random(19))
    build_vault_lip(G, L, shell, random.Random(37))
    # (the Great Wall carries its flowstone in its own folds: build_great_curtains stays out)
    build_adit(G, L, rock, glow)
    build_camp(G, L, rock, glow)
    build_forge_alcove(G, L, rock, glow, water, random.Random(31))
    build_waters(G, L, rock, water, therm, ledge_top)
    build_cliff_faces(G, L, rock, glow, random.Random(23))
    build_terrace_lips(G, L, rock)
    build_trail_edges(G, L, rock, glow, random.Random(29))
    build_rim(G, L, rock, water, random.Random(41))
    build_blockout_rocks(G, L, rock, glow, random.Random(11))
    build_jungle(G, L, rock, roots, glow, random.Random(47))
    build_basecamp_gear(G, L, rock, glow, random.Random(53))
    build_breakdown(G, L, rock, random.Random(59))
    build_mudflats(G, L, rock, water, random.Random(61))
    build_pearl_basins(G, L, rock, random.Random(67))
    build_unreached(G, L, rock, random.Random(97))
    build_lake_shore(G, L, rock, random.Random(71))
    build_rift_decor(G, L, rock, glow, random.Random(73))
    build_dressing(G, L, rock, glow, random.Random(79))
    build_bats(G, L, rock, random.Random(79))
    build_overlook(G, L, rock, roots, random.Random(13))
    build_winch(G, L, rock, glow, coll)
    # (the causeway out to the islet a hand's depth under the water, waded: no stepping stones,
    # docs/caverns-roadmap.md R6.7)
    build_raft(G, L, coll)
    build_monolith_dais(G, L, rock, glow, random.Random(89))
    build_far_passage(G, L, glow, random.Random(83))

    for f in glow.bm.faces:
        glow.setsmooth(f)
    build_fauna_templates(coll)
    finish_object("caverns_walk_collider", floor, coll, mottle=0.03)
    finish_object("Cave_Rock", rock, coll, mottle=0.06, wear=0.22)
    finish_object("Cave_Shell", shell, coll, mottle=0.06, wear=0.25)
    finish_object("Cave_Roots", roots, coll, mottle=0.06, wear=0.15)
    finish_object("Cave_Glow", glow, coll, bake=False)
    finish_object("Cave_Water", water, coll, bake=False)
    finish_object("Cave_Thermal", therm, coll, bake=False)


def build(root):
    LIGHTS.clear()
    GEO_STATS.clear()
    coll = clean_caverns_collection()
    L = read_layout(root)
    ORE_RADII.clear()
    ORE_RADII.update(read_ore_radii(root))
    G = Ground(read_terrain(root))
    build_world(G, L, coll, read_thermal_ledge(root))
    ores = build_ores(coll, ORE_RADII)
    return coll, L, ores


def export(coll, path):
    layer = bpy.context.view_layer
    layer.update()
    # (only this collection's objects selected, one by one: never select_all)
    for o in layer.objects:
        if o is not None:
            o.select_set(o.name in coll.all_objects)
    kwargs = dict(filepath=path, export_format="GLB", export_apply=True, export_yup=True, use_selection=True, export_animations=False, export_draco_mesh_compression_enable=False, export_extras=False, export_vertex_color="ACTIVE", export_normals=True)
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
        out[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "verts": len(o.data.vertices), "materials": len(o.data.materials)}
    static = {k: v for k, v in out.items() if not k.startswith(("Ore_", "Fauna_", "Find_"))}
    return {"objects": out, "tris": sum(v["tris"] for v in out.values()), "verts": sum(v["verts"] for v in out.values()), "staticDrawCalls": sum(v["materials"] for v in static.values())}


def main():
    report = globals().get("REPORT_PATH") or os.environ.get("CAVERNS_REPORT")
    # (CAVERNS_NO_STUDIO: a trial run that neither opens nor saves the studio's master file)
    solo = bool(os.environ.get("CAVERNS_NO_STUDIO") or globals().get("NO_STUDIO"))
    try:
        root = repo_root()
        if not solo:
            studio(root, "begin")
        coll, L, ores = build(root)
        out = os.environ.get("CAVERNS_OUT") or globals().get("CAVERNS_OUT") or os.path.join(root, "client", "public", "models", "caverns.glb")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        export(coll, out)
        exported = os.path.getsize(out)
        packed = quantize_glb(out)
        packed["meshopt"] = meshopt_pack(root, out)
        result = {"ok": True, "glb": out, "exported": exported, "bytes": os.path.getsize(out), "packed": packed, **summary(coll), "geology": dict(GEO_STATS)}
        # (the templates sit at the origin: not in the studio's grid)
        for o in list(coll.all_objects):
            if o.name.startswith(("Ore_", "Fauna_", "Find_")):
                bpy.data.objects.remove(o, do_unlink=True)
        if not solo:
            result["studio"] = studio(root, "finish", [coll])
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}
    print(json.dumps(result, indent=1))
    if report:
        with open(report, "w") as f:
            json.dump(result, f, indent=1)


main()
