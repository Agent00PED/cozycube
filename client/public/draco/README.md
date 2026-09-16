Copy the Draco decoder files here before using compressed .glb models:

```bash
cp node_modules/three/examples/jsm/libs/draco/* client/public/draco/
```

`useGLTF(url, "/draco/")` in `scene/RoomModel.tsx` (Phase 2) expects the decoder at this path, same-origin — Discord's iframe CSP blocks loading it from an external CDN.
