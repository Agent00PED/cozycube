// `npm run pack-models [file.glb ...]` (scripts/pack-models.mts): EXT_meshopt_compression over a model's vertex and index
// buffers (docs/caverns-roadmap.md R2.6), lossless for every vertex (a triangle's three indices may come back
// rotated, its winding kept; no quantization here: the builders already quantize what they can), only smaller
// on the wire and on disk. drei's useGLTF decodes it (three-stdlib's MeshoptDecoder, on by default).
//
// A buffer view is packed when every accessor on it is a vertex attribute (the ATTRIBUTES mode: its
// stride a multiple of 4, at most 256) or a triangle list's indices (TRIANGLES); anything else (an
// animation's keys, an image) stays as it was. The packed views keep their place in a fallback buffer
// with no data (the extension's `fallback`), so the file is a valid glTF that needs the extension.
// Running it on a file already packed does nothing. With no files named, the models the builders make
// that gain from it (DEFAULTS: the worlds, the avatar, the crowds, the fish).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MeshoptEncoder } from "meshoptimizer";

const EXT = "EXT_meshopt_compression";
const ROOT = resolve(import.meta.dirname, "..");
// (every model big enough to matter: the worlds, the avatar, the crowds, the fish. A builder that makes
// one of these anew leaves it unpacked unless it packs it itself, as the caverns' and the avatar's do:
// run this after any other builder.)
const DEFAULTS = ["caverns", "avatar", "casino", "campfire", "forest", "casino_vip", "boxing_ring", "fish", "ring_regulars", "patrons", "cat", "props", "trees", "chloe_maid"].map((n) => `client/public/models/${n}.glb`);

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const align4 = (n: number) => (n + 3) & ~3;

interface Gltf {
  asset: unknown;
  buffers: { byteLength: number; uri?: string; extensions?: Record<string, unknown> }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number; extensions?: Record<string, unknown> }[];
  accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

/** Reads a GLB: its JSON and its binary chunk. */
function readGlb(path: string): { json: Gltf; bin: Uint8Array } {
  const data = readFileSync(path);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jlen = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jlen).toString("utf8")) as Gltf;
  const off = 20 + jlen;
  const blen = off < data.length ? data.readUInt32LE(off) : 0;
  const bin = new Uint8Array(data.buffer, data.byteOffset + off + 8, blen);
  return { json, bin };
}

function writeGlb(path: string, json: Gltf, bin: Uint8Array) {
  let text = Buffer.from(JSON.stringify(json), "utf8");
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  let body = Buffer.from(bin);
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
  const out = Buffer.alloc(12 + 8 + text.length + 8 + body.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(text.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  text.copy(out, 20);
  out.writeUInt32LE(body.length, 20 + text.length);
  out.writeUInt32LE(0x004e4942, 24 + text.length);
  body.copy(out, 28 + text.length);
  writeFileSync(path, out);
}

/** How each buffer view is used: as vertex attributes (with their element size), as a triangle list's
 *  indices, or otherwise (left alone). */
function usage(json: Gltf): Map<number, { kind: "attr" | "tri" | "other"; size: number }> {
  const uses = new Map<number, { kind: "attr" | "tri" | "other"; size: number }>();
  const mark = (view: number | undefined, kind: "attr" | "tri" | "other", size: number) => {
    if (view === undefined) return;
    const was = uses.get(view);
    if (!was) uses.set(view, { kind, size });
    else if (was.kind !== kind || was.size !== size) uses.set(view, { kind: "other", size: 0 });
  };
  const seen = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      for (const ai of Object.values(prim.attributes)) {
        const a = json.accessors[ai];
        seen.add(ai);
        mark(a.bufferView, a.sparse ? "other" : "attr", COMPONENT_BYTES[a.componentType] * TYPE_COUNT[a.type]);
      }
      if (prim.indices !== undefined) {
        const a = json.accessors[prim.indices];
        seen.add(prim.indices);
        const triangles = (prim.mode ?? 4) === 4 && a.count % 3 === 0 && (a.componentType === 5123 || a.componentType === 5125);
        mark(a.bufferView, triangles ? "tri" : "other", COMPONENT_BYTES[a.componentType]);
      }
    }
  }
  // (any accessor that is not a mesh's attribute or indices makes its view "other")
  json.accessors.forEach((a, i) => {
    if (!seen.has(i)) mark(a.bufferView, "other", 0);
  });
  return uses;
}

export async function packModel(path: string): Promise<{ path: string; before: number; after: number; packed: number } | null> {
  await MeshoptEncoder.ready;
  const before = readFileSync(path).length;
  const { json, bin } = readGlb(path);
  if (json.extensionsUsed?.includes(EXT)) return null;
  if (json.buffers.length !== 1 || json.buffers[0].uri) throw new Error(`${path}: one embedded buffer expected`);
  const uses = usage(json);
  const out: Uint8Array[] = [];
  let outLen = 0;
  let fallbackLen = 0;
  let packed = 0;
  const push = (bytes: Uint8Array) => {
    const at = outLen;
    out.push(bytes);
    outLen += bytes.length;
    const pad = align4(outLen) - outLen;
    if (pad) {
      out.push(new Uint8Array(pad));
      outLen += pad;
    }
    return at;
  };
  json.bufferViews.forEach((view, vi) => {
    const src = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const use = uses.get(vi);
    let mode: "ATTRIBUTES" | "TRIANGLES" | "" = "";
    let stride = 0;
    if (use?.kind === "attr") {
      stride = view.byteStride ?? use.size;
      if (stride % 4 === 0 && stride <= 256 && view.byteLength % stride === 0) mode = "ATTRIBUTES";
    } else if (use?.kind === "tri") {
      stride = use.size;
      if (view.byteLength % (stride * 3) === 0 && !view.byteStride) mode = "TRIANGLES";
    }
    if (!mode) {
      view.byteOffset = push(src.slice());
      view.buffer = 0;
      return;
    }
    const count = view.byteLength / stride;
    const enc = MeshoptEncoder.encodeGltfBuffer(src.slice(), count, stride, mode);
    const at = push(enc);
    const fb = align4(fallbackLen);
    fallbackLen = fb + view.byteLength;
    view.extensions = { ...(view.extensions ?? {}), [EXT]: { buffer: 0, byteOffset: at, byteLength: enc.length, byteStride: stride, mode, count } };
    view.buffer = 1;
    view.byteOffset = fb;
    if (mode === "ATTRIBUTES" && view.byteStride === undefined && use?.kind === "attr" && stride !== use.size) view.byteStride = stride;
    packed++;
  });
  const merged = new Uint8Array(outLen);
  let o = 0;
  for (const part of out) {
    merged.set(part, o);
    o += part.length;
  }
  json.buffers = [{ byteLength: outLen }, { byteLength: align4(fallbackLen), extensions: { [EXT]: { fallback: true } } }];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), EXT])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), EXT])];
  writeGlb(path, json, merged);
  return { path, before, after: readFileSync(path).length, packed };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS.map((f) => resolve(ROOT, f));
  for (const f of files) {
    const r = await packModel(resolve(f));
    console.log(r ? `${r.path}: ${r.before.toLocaleString()} -> ${r.after.toLocaleString()} bytes (${r.packed} views packed)` : `${f}: already packed`);
  }
}
