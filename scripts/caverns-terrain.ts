// `npm run caverns-terrain`: the Glimmering Caverns' floor, for the Blender builder.
//
// shared/worlds/caverns.ts samples the ground on a 0.5 m grid (the walk surface, cavernsFloorY) and a
// 0.25 m mask of where you can stand; the builder (scripts/blender/build_caverns.py) models the ground
// and the click collider from that very grid, so it reads it from the file this writes:
// scripts/blender/data/caverns_terrain.json. `npm run check-layout` fails while the file is stale.
//
//   --png <path>   also draws the floor as a picture (height shaded, the mask's walls red), to look at

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { cavernsTerrainData } from "../shared/worlds/caverns";

export const CAVERNS_TERRAIN_PATH = join(__dirname, "blender", "data", "caverns_terrain.json");

/** The file's text for the current layout (the validator compares it with what is on disk). */
export function cavernsTerrainText(): string {
  return JSON.stringify(cavernsTerrainData()) + "\n";
}

function png(path: string) {
  const t = cavernsTerrainData();
  const S = t.maskN * 2;
  const rows: Buffer[] = [];
  const surfaceTint: Record<number, [number, number, number]> = { 0: [120, 110, 100], 1: [110, 150, 80], 2: [170, 160, 140], 3: [236, 224, 190], 4: [70, 80, 96], 5: [60, 70, 110], 6: [230, 225, 205], 7: [60, 150, 170], 8: [200, 195, 175], 9: [140, 115, 85] };
  for (let y = 0; y < S; y++) {
    const row = Buffer.alloc(1 + S * 3);
    for (let x = 0; x < S; x++) {
      const mi = Math.floor(x / 2);
      const mk = Math.floor(y / 2);
      const wx = t.x0 + (x + 0.5) * (t.maskCell / 2);
      const wz = t.x0 + (y + 0.5) * (t.maskCell / 2);
      const gi = Math.min(t.n - 1, Math.round((wx - t.x0) / t.cell));
      const gk = Math.min(t.n - 1, Math.round((wz - t.x0) / t.cell));
      const h = t.heights[gk * t.n + gi];
      const s = t.surface[gk * t.n + gi];
      const shade = 0.45 + 0.55 * Math.max(0, Math.min(1, (h + 1) / 4.8));
      let [r, g, b] = surfaceTint[s] ?? [128, 128, 128];
      r *= shade;
      g *= shade;
      b *= shade;
      if (t.mask[mk * t.maskN + mi] === "0") {
        r = r * 0.55 + 110;
        g *= 0.55;
        b *= 0.55;
      }
      // (a contour every 0.5 m)
      if (Math.abs(h * 2 - Math.round(h * 2)) < 0.04) r = g = b = 30;
      row[1 + x * 3] = Math.min(255, r);
      row[2 + x * 3] = Math.min(255, g);
      row[3 + x * 3] = Math.min(255, b);
    }
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
}

if (require.main === module) {
  mkdirSync(dirname(CAVERNS_TERRAIN_PATH), { recursive: true });
  writeFileSync(CAVERNS_TERRAIN_PATH, cavernsTerrainText());
  console.log(`wrote ${CAVERNS_TERRAIN_PATH}`);
  const at = process.argv.indexOf("--png");
  if (at > 0 && process.argv[at + 1]) {
    png(process.argv[at + 1]);
    console.log(`drew ${process.argv[at + 1]}`);
  }
}
