"""The caverns builder in Blender: the studio's hook, the "Caverns" collection emptied of its own
objects only, the finishes (one material a finish), every natural corner paler and every crevice
darker (`vertex_wear`), and a mesh made an object (`finish_object`)."""

import os
import traceback

import bpy
from .kit import ambient_at, COLLECTION, DOUBLE_SIDED, fbm, FINISHES, game_point, GEO_STATS, lit


# ---------------------------------------------------------------------------------------------
# Blender: the studio, the collection, the finishes, the objects


def studio(root, call, *args):
    path = os.path.join(root, "scripts", "blender", "studio.py")
    ns = {"__name__": "studio"}
    try:
        exec(compile(open(path, encoding="utf-8").read(), path, "exec"), ns)
        return ns[call](root, *args)
    except Exception:
        return {"error": traceback.format_exc()}


def clean_caverns_collection():
    """Empties the "Caverns" collection (the studio keeps it under Studio_Caverns, its objects at
    X = 212) and hands it back to be filled again: every object in it removed, then the meshes only
    they used. Nothing is selected (no select_all) and no other collection is touched: the Velvet
    Ring, the Forest (Forest_Ground and the rest) and every other world keep all they have."""
    coll = bpy.data.collections.get(COLLECTION)
    scene = bpy.context.scene.collection
    if coll is None:
        coll = bpy.data.collections.new(COLLECTION)
    removed = 0
    meshes = []
    for o in list(coll.all_objects):
        if o.type == "MESH" and o.data is not None:
            meshes.append(o.data)
        bpy.data.objects.remove(o, do_unlink=True)
        removed += 1
    for me in meshes:
        if me.users == 0:
            bpy.data.meshes.remove(me)
    # (linked into the scene wherever it is: under Studio_Caverns in the master, at the root on a
    # fresh file)
    linked = coll.name in scene.children or any(coll.name in c.children for c in bpy.data.collections if c is not coll)
    if not linked:
        scene.children.link(coll)
    GEO_STATS["cleaned"] = removed
    return coll


def material(name):
    """A finish: its colour from the faces' vertex colours (the glows emit it too)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    attr = next((n for n in nodes if n.type == "VERTEX_COLOR"), None) or nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    rough = FINISHES[name]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if name in ("CV_Glow", "CV_OreGlow"):
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (1.0, 1.0, 1.0, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.8
    if name in ("CV_Water", "CV_ThermalWater"):
        bsdf.inputs["Alpha"].default_value = 0.6 if name == "CV_Water" else 0.62
        try:
            m.blend_method = "BLEND"
        except Exception:
            pass
    m.roughness = rough
    m.use_backface_culling = name not in DOUBLE_SIDED
    return m


def vertex_wear(bm):
    """How each vertex stands (-1 down in a crevice .. 1 out on a corner): its neighbours' lean below or
    above its own tangent plane (the rock's weathered edges and its dark cracks)."""
    out = {}
    for v in bm.verts:
        acc, k = 0.0, 0
        for e in v.link_edges:
            d = e.other_vert(v).co - v.co
            if d.length > 1e-6:
                acc += v.normal.dot(d.normalized())
                k += 1
        out[v.index] = max(-1.0, min(1.0, -2.2 * acc / k)) if k else 0.0
    return out


def finish_object(name, M, coll, bake=True, mottle=0.0, wear=0.0):
    """The mesh as an object: every face painted its colour (mottled a little, the light baked in, its
    natural corners paler and its crevices darker by `wear`)."""
    bm = M.bm
    col = bm.loops.layers.float_color.new("Col")
    bm.normal_update()
    bm.verts.index_update()
    worn = vertex_wear(bm) if wear else None
    for f in bm.faces:
        face_base = M.colors[f[M.fl]] if M.colors else (0.5, 0.5, 0.5)
        smooth_face = f[M.fs] == 1
        for loop in f.loops:
            v = loop.vert
            own = (smooth_face or f[M.fv] == 1) and v[M.vl] > 0
            base = M.colors[v[M.vl] - 1] if own else face_base
            alpha = 0.0 if ((v[M.vl] - 1) if own else f[M.fl]) in M.plain else 1.0
            n = v.normal if smooth_face else f.normal
            p = game_point(v.co)
            c = base
            if mottle:
                k = 1 + mottle * fbm(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 5)
                c = (c[0] * k, c[1] * k, c[2] * k)
            if worn is not None and alpha > 0.5:
                w = worn[v.index]
                k = 1 + wear * (w if w > 0 else 1.4 * w)
                c = (c[0] * k, c[1] * k, c[2] * k)
            if bake:
                c = lit(c, p, (n.x, n.z, -n.y), ambient_at(p))
            loop[col] = (c[0], c[1], c[2], alpha)
    for f in bm.faces:
        f.material_index = 0
        f.smooth = f[M.fs] == 1
    me = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(M.finish))
    attr = me.color_attributes.get("Col")
    if attr is not None:
        me.color_attributes.active_color = attr
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except AttributeError:
            pass
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob
