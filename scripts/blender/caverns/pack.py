"""The export packed: KHR_mesh_quantization over the static meshes (`quantize_glb`), keeping the
model under its budget."""

import json
import math


# ---------------------------------------------------------------------------------------------
# the export: packed


def quantize_glb(path, names_prefix=("Cave_", "caverns_walk_collider")):
    """KHR_mesh_quantization over the static meshes: positions as 16-bit (the node carrying the
    offset and scale), normals as 8-bit, colours as 8-bit."""
    import struct

    raw = open(path, "rb").read()
    jlen = struct.unpack_from("<I", raw, 12)[0]
    js = json.loads(raw[20 : 20 + jlen].decode("utf-8"))
    off = 20 + jlen
    blen = struct.unpack_from("<I", raw, off)[0]
    bin_ = raw[off + 8 : off + 8 + blen]
    views = js["bufferViews"]
    accs = js["accessors"]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    csize = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    fmt = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}

    def read(ai):
        a = accs[ai]
        v = views[a["bufferView"]]
        n = ncomp[a["type"]]
        stride = v.get("byteStride", n * csize[a["componentType"]])
        base = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return [struct.unpack_from("<" + fmt[a["componentType"]] * n, bin_, base + i * stride) for i in range(a["count"])]

    new_data = {}  # accessor index -> (bytes, byteStride)
    changed = 0
    for node in js["nodes"]:
        if "mesh" not in node or not node.get("name", "").startswith(names_prefix):
            continue
        if any(k in node for k in ("translation", "rotation", "scale", "matrix")) or node.get("children"):
            continue
        mesh = js["meshes"][node["mesh"]]
        pts = [read(p["attributes"]["POSITION"]) for p in mesh["primitives"]]
        lo = [min(p[j] for ps in pts for p in ps) for j in range(3)]
        hi = [max(p[j] for ps in pts for p in ps) for j in range(3)]
        scale = [(hi[j] - lo[j]) / 65535.0 if hi[j] > lo[j] else 1.0 for j in range(3)]
        node["translation"] = lo
        node["scale"] = scale
        for prim in mesh["primitives"]:
            at = prim["attributes"]
            ai = at["POSITION"]
            buf = bytearray()
            qs = []
            for p in read(ai):
                q = [max(0, min(65535, int(round((p[j] - lo[j]) / scale[j])) if hi[j] > lo[j] else 0)) for j in range(3)]
                qs.append(q)
                buf += struct.pack("<HHHH", q[0], q[1], q[2], 0)
            new_data[ai] = (bytes(buf), 8)
            a = accs[ai]
            a["componentType"] = 5123
            a["normalized"] = False
            a["min"] = [min(q[j] for q in qs) for j in range(3)]
            a["max"] = [max(q[j] for q in qs) for j in range(3)]
            if "NORMAL" in at:
                ni = at["NORMAL"]
                buf = bytearray()
                for nx, ny, nz in read(ni):
                    # (under the node's non-uniform scale a normal is stored scaled by it, so the
                    # model's normal matrix (the scale's inverse) turns it back)
                    sx, sy, sz = nx * scale[0], ny * scale[1], nz * scale[2]
                    ln = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0
                    buf += struct.pack("<bbbb", *[max(-127, min(127, int(round(c / ln * 127)))) for c in (sx, sy, sz)], 0)
                new_data[ni] = (bytes(buf), 4)
                b = accs[ni]
                b["componentType"] = 5120
                b["normalized"] = True
                b.pop("min", None)
                b.pop("max", None)
            if "COLOR_0" in at and accs[at["COLOR_0"]]["componentType"] != 5121:
                ci = at["COLOR_0"]
                c = accs[ci]
                n = ncomp[c["type"]]
                div = 65535.0 if c["componentType"] == 5123 else 1.0
                buf = bytearray()
                for comps in read(ci):
                    vals = [max(0, min(255, int(round(x / div * 255)))) for x in comps] + [255] * (4 - n)
                    buf += struct.pack("<BBBB", *vals[:4])
                new_data[ci] = (bytes(buf), 4)
                c["componentType"] = 5121
                c["normalized"] = True
                c["type"] = "VEC4"
        changed += 1
    if not changed:
        return {"quantized": 0}
    # the new binary: every view still read kept, the replaced ones dropped, the new ones appended
    used = {}
    for i, a in enumerate(accs):
        if i not in new_data and "bufferView" in a:
            used.setdefault(a["bufferView"], True)
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            if "indices" in p and p["indices"] not in new_data:
                used.setdefault(accs[p["indices"]]["bufferView"], True)
    out = bytearray()
    remap = {}
    new_views = []
    for vi, v in enumerate(views):
        if vi not in used:
            continue
        while len(out) % 4:
            out += b"\0"
        start = v.get("byteOffset", 0)
        nv = dict(v)
        nv["byteOffset"] = len(out)
        out += bin_[start : start + v["byteLength"]]
        remap[vi] = len(new_views)
        new_views.append(nv)
    for ai, (data, stride) in new_data.items():
        while len(out) % 4:
            out += b"\0"
        new_views.append({"buffer": 0, "byteOffset": len(out), "byteLength": len(data), "byteStride": stride, "target": 34962})
        out += data
        accs[ai]["bufferView"] = len(new_views) - 1
        accs[ai]["byteOffset"] = 0
    for i, a in enumerate(accs):
        if i not in new_data and "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    while len(out) % 4:
        out += b"\0"
    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(out)}]
    for key in ("extensionsUsed", "extensionsRequired"):
        lst = js.setdefault(key, [])
        if "KHR_mesh_quantization" not in lst:
            lst.append("KHR_mesh_quantization")
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    while len(jb) % 4:
        jb += b" "
    total = 12 + 8 + len(jb) + 8 + len(out)
    packed = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    open(path, "wb").write(packed)
    return {"quantized": changed, "bytes": len(packed)}
