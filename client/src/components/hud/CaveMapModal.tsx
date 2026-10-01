import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANVIL,
  CAVE_ADIT,
  CAVE_WINCH,
  CAVERNS_LAYOUT as L,
  CAVERNS_MASK,
  FINNEGAN,
  FORGE,
  GUS,
  HEARTH,
  MASK_CELL,
  MASK_N,
  ORE_NODES,
  PHOTO_SPOT,
  SURFACE,
  TERRAIN_CELL,
  TERRAIN_HEIGHTS,
  TERRAIN_N,
  cavernsSurface,
} from "@shared/worlds/caverns";
import { ORE_KINDS, parseOres } from "@shared/caverns_mining";
import type { PlayerState } from "@shared/types";
import { Modal } from "./Modal";

// The Cave Map (docs/caverns-roadmap.md R2.10): the Glimmering Caverns from above, drawn from the very
// ground the game walks (each zone's ground, the water, where you cannot stand, the lie of the land),
// with every zone's name, the landmarks (Gus, the forge, the anvil, Finnegan, the hearth, the winch,
// the adit, the photo spot), every ore node (bright while it stands, grey with its countdown while it
// grows back; a Motherlode ringed gold, the Monolith awake ringed violet), everyone down here, and
// you. M opens and closes it in the caverns; so does the ore satchel's 🗺️.

const PX = 12;
const SIZE = Math.round(L.half * 2 * PX);
const GROUND: Record<number, [number, number, number]> = {
  [SURFACE.basecamp]: [150, 128, 96],
  [SURFACE.jungle]: [78, 112, 60],
  [SURFACE.breakdown]: [118, 122, 132],
  [SURFACE.mudflats]: [150, 108, 78],
  [SURFACE.overlook]: [158, 152, 138],
  [SURFACE.travertine]: [198, 188, 164],
  [SURFACE.rift]: [52, 48, 72],
  [SURFACE.shore]: [124, 112, 94],
  [SURFACE.trail]: [196, 170, 120],
  [SURFACE.bed]: [28, 92, 104],
  [SURFACE.stream]: [58, 150, 160],
  [SURFACE.pool]: [96, 190, 184],
};
const WATER = new Set<number>([SURFACE.bed, SURFACE.stream, SURFACE.pool]);
const toPx = (v: number) => (v + L.half) * PX;

/** The ground from above, once: its colour by zone, shaded by the lie of the land (lit from the
 *  north-west), darker where no one can stand, the water deeper where it is. */
function paintGround(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d")!;
  const img = g.createImageData(SIZE, SIZE);
  const h = (x: number, z: number) => {
    const i = Math.max(0, Math.min(TERRAIN_N - 1, Math.round((x + L.half) / TERRAIN_CELL)));
    const k = Math.max(0, Math.min(TERRAIN_N - 1, Math.round((z + L.half) / TERRAIN_CELL)));
    return TERRAIN_HEIGHTS[k * TERRAIN_N + i];
  };
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = px / PX - L.half;
      const z = py / PX - L.half;
      const s = cavernsSurface(x, z);
      const base = GROUND[s] ?? [90, 84, 78];
      const y = h(x, z);
      // (lit from the north-west, and the high ground a touch lighter)
      const shade = 1 + (h(x - 0.5, z - 0.5) - y) * 0.9 + (y - 2.5) * 0.03;
      const mi = Math.min(MASK_N - 1, Math.max(0, Math.floor((x + L.half) / MASK_CELL)));
      const mk = Math.min(MASK_N - 1, Math.max(0, Math.floor((z + L.half) / MASK_CELL)));
      const walk = CAVERNS_MASK[mk * MASK_N + mi] === 1;
      const water = WATER.has(s);
      const dim = water ? 1 - Math.min(0.45, Math.max(0, -y) * 0.3) : walk ? 1 : 0.62;
      const q = (py * SIZE + px) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[q + ch] = Math.max(0, Math.min(255, base[ch] * shade * dim));
      img.data[q + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
let ground: HTMLCanvasElement | null = null;

const ZONE_LABELS: [string, number, number][] = [
  ["Basecamp", -1, -17.5],
  ["Doline Jungle", -16, -18.5],
  ["Coal Breakdown", 16, -19],
  ["Iron Mudflats", -15, -5.5],
  ["Pearl Terraces", -15, 12],
  ["Hound's Overlook", 2.5, -9],
  ["Glimmer Rift", 17.5, -3],
  ["Great Lake", 6, 15],
];
const MARKS: [string, number, number, string][] = [
  ["⛏️", GUS.x, GUS.z, "Gus"],
  ["🔥", FORGE.x, FORGE.z + 1, "The forge"],
  ["🔨", ANVIL.x, ANVIL.z, "The anvil"],
  ["🦎", FINNEGAN.x, FINNEGAN.z, "Finnegan"],
  ["🏕️", HEARTH.x, HEARTH.z, "The hearth"],
  ["🪢", CAVE_WINCH.bottom.x, CAVE_WINCH.bottom.z, "The winch up"],
  ["🌲", CAVE_ADIT.x, CAVE_ADIT.z + 1, "The adit, up to the woods"],
  ["📸", PHOTO_SPOT.x, PHOTO_SPOT.z, "The photo spot"],
];

export function CaveMapModal({ ores, players, localSessionId, onClose }: { ores: string; players: Record<string, PlayerState>; localSessionId: string | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [, tick] = useState(0);
  // (a redraw a second, for the countdowns and everyone's walk)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const sync = useMemo(() => parseOres(ores), [ores]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    ground ??= paintGround();
    g.drawImage(ground, 0, 0);
    const now = Date.now();
    g.textAlign = "center";
    g.textBaseline = "middle";
    // the zones' names
    g.font = "600 13px Fredoka, sans-serif";
    for (const [name, x, z] of ZONE_LABELS) {
      g.fillStyle = "rgba(10, 12, 18, 0.55)";
      const w = g.measureText(name).width + 12;
      g.fillRect(toPx(x) - w / 2, toPx(z) - 9, w, 18);
      g.fillStyle = "#f4ead8";
      g.fillText(name, toPx(x), toPx(z));
    }
    // the ore nodes
    for (const n of ORE_NODES) {
      const o = sync[n.id];
      const kind = ORE_KINDS[n.kind];
      if (kind.crew && !o?.up) continue;
      const x = toPx(n.x);
      const z = toPx(n.z);
      const up = o?.up ?? true;
      g.beginPath();
      g.arc(x, z, n.kind === "monolith" ? 8 : 5.5, 0, Math.PI * 2);
      g.fillStyle = up ? kind.glow : "#5b5a60";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.stroke();
      if (o?.ml && o.ml > now) {
        g.beginPath();
        g.arc(x, z, 11 + 2 * Math.sin(now / 200), 0, Math.PI * 2);
        g.strokeStyle = "#ffd35a";
        g.lineWidth = 3;
        g.stroke();
      }
      if (o?.aw && o.aw > now) {
        g.beginPath();
        g.arc(x, z, 14, 0, Math.PI * 2);
        g.strokeStyle = "#c48cff";
        g.lineWidth = 3;
        g.stroke();
      }
      if (!up && o?.at && o.at > now) {
        const s = Math.ceil((o.at - now) / 1000);
        const label = s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}` : `${s}s`;
        g.font = "700 10px Fredoka, sans-serif";
        g.fillStyle = "rgba(10,12,18,0.7)";
        const w = g.measureText(label).width + 6;
        g.fillRect(x - w / 2, z + 7, w, 12);
        g.fillStyle = "#e9e3ff";
        g.fillText(label, x, z + 13);
      }
    }
    // the landmarks
    g.font = "16px sans-serif";
    for (const [emoji, x, z] of MARKS) g.fillText(emoji, toPx(x), toPx(z));
    // everyone down here, and you
    for (const [id, p] of Object.entries(players)) {
      if (p.map !== "glimmering_caverns") continue;
      const me = id === localSessionId;
      const x = toPx(p.x);
      const z = toPx(p.z);
      g.beginPath();
      g.arc(x, z, me ? 7.5 : 5, 0, Math.PI * 2);
      g.fillStyle = me ? "#ffffff" : "#d8d2cc";
      g.fill();
      g.lineWidth = me ? 3 : 2;
      g.strokeStyle = me ? "#ffb347" : "rgba(0,0,0,0.6)";
      g.stroke();
      g.font = `${me ? 700 : 600} 10px Fredoka, sans-serif`;
      g.fillStyle = me ? "#ffd9a0" : "#ffffff";
      g.fillText(me ? "You" : p.username.slice(0, 12), x, z - 12);
    }
  });
  const legend = useMemo(
    () =>
      (["coal", "copper", "iron", "silver", "glimmer", "monolith"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ORE_KINDS[k].glow }} />
          {ORE_KINDS[k].name}
        </span>
      )),
    [],
  );
  return (
    <Modal title="The Cave Map" icon="🗺️" onClose={onClose} width={620}>
      <div className="flex flex-col items-center gap-2">
        <canvas ref={canvas} width={SIZE} height={SIZE} className="h-auto w-full max-w-[540px] rounded-2xl border border-white/10" style={{ imageRendering: "auto", maxHeight: "62vh", objectFit: "contain" }} />
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] opacity-85">
          {legend}
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#5b5a60]" /> growing back
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#ffd35a]" /> Motherlode
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#ffb347] bg-white" /> you
          </span>
        </div>
      </div>
    </Modal>
  );
}
