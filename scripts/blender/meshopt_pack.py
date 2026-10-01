"""The last step of a builder's export (docs/caverns-roadmap.md R2.6): EXT_meshopt_compression over the
model's vertex and index buffers, by scripts/pack-models.mts (npm run pack-models), run with the
repository's own Node. Lossless for every vertex (a triangle's three indices may come back rotated,
its winding kept). Where Node is not to be found the model is left as exported, and the report says so.
"""
import os
import subprocess


def meshopt_pack(root, path):
    script = os.path.join(root, "scripts", "pack-models.mts")
    try:
        done = subprocess.run(["npx", "tsx", script, path], cwd=root, capture_output=True, text=True, timeout=300, shell=(os.name == "nt"))
    except Exception as err:  # (no Node here: the model stays as exported)
        return {"packed": False, "error": str(err)}
    return {"packed": done.returncode == 0, "bytes": os.path.getsize(path), "out": (done.stdout or done.stderr).strip()[-400:]}
