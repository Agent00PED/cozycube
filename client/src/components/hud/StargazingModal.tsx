import { useEffect, useRef, useState } from "react";
import { STAR_SPARK_COINS, type CampfirePacket, type ShootingStar, type StarCaught } from "@shared/types";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

interface Props {
  send: (packet: CampfirePacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string;
  onClose: () => void;
}

// The brass telescope by the campfire's front fence. Looking through it (STARGAZE on while this is
// open) shows a round window on the night sky: three layers of stars drifting at their own depths
// (the lens follows the pointer a little, so they slide past each other), a few twinkling
// constellations, and every few seconds a shooting star the server sends across the lens. Tap it
// on its way (STAR_CATCH) to catch a Star Spark: the server says whether it counted (starCaught).

const SIZE = 320;

interface Dot {
  x: number;
  y: number;
  r: number;
  phase: number;
  rate: number;
}

/** A seeded scatter, the same every time the lens opens. */
function scatter(seed: number, n: number, rMin: number, rMax: number): Dot[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: rnd() * 1.3 - 0.15, y: rnd() * 1.3 - 0.15, r: rMin + rnd() * (rMax - rMin), phase: rnd() * 6.28, rate: 0.6 + rnd() * 2.2 }));
}

const LAYERS = [
  { dots: scatter(7, 90, 0.4, 0.9), depth: 6, alpha: 0.5 },
  { dots: scatter(19, 45, 0.7, 1.4), depth: 14, alpha: 0.75 },
  { dots: scatter(41, 16, 1.2, 2.1), depth: 26, alpha: 1 },
];

/** The camp's own constellations (points in lens fractions, and which to join). */
const CONSTELLATIONS = [
  { name: "The Kettle", points: [[0.18, 0.3], [0.27, 0.26], [0.35, 0.3], [0.33, 0.39], [0.21, 0.4], [0.42, 0.24], [0.5, 0.2]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 6]] },
  { name: "Mochi", points: [[0.62, 0.55], [0.66, 0.47], [0.7, 0.54], [0.76, 0.47], [0.8, 0.55], [0.71, 0.64]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
  { name: "The Canoe", points: [[0.22, 0.72], [0.32, 0.78], [0.45, 0.8], [0.56, 0.76]], lines: [[0, 1], [1, 2], [2, 3]] },
];

type Burst = { x: number; y: number; at: number; text: string };

export function StargazingModal({ send, subscribeMessages, localSessionId, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const star = useRef<(ShootingStar & { at: number; hit: boolean }) | null>(null);
  const aim = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const bursts = useRef<Burst[]>([]);
  const lastHit = useRef<{ x: number; y: number } | null>(null);
  const [caught, setCaught] = useState(0);
  const [note, setNote] = useState("Tap a shooting star as it streaks across the lens");

  // looking through it, for as long as this is open (send is a fresh function each render: held in a ref)
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    sendRef.current({ type: "STARGAZE", on: true });
    return () => sendRef.current({ type: "STARGAZE", on: false });
  }, []);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "shootingStar") {
          star.current = { ...(payload as ShootingStar), at: performance.now(), hit: false };
        } else if (type === "starCaught" && (payload as StarCaught).sessionId === localSessionId) {
          const c = payload as StarCaught;
          playSfx("star");
          setCaught((n) => n + 1);
          const at = lastHit.current ?? { x: SIZE / 2, y: SIZE / 2 };
          bursts.current.push({ ...at, at: performance.now(), text: c.coins > 0 ? `+${c.coins} 🪙` : "✨" });
          setNote(c.coins > 0 ? `Star Spark! +${c.coins} coins` : "A Star Spark! (today's star coins are all earned)");
        }
      }),
    [subscribeMessages, localSessionId]
  );

  // the sky
  useEffect(() => {
    const cv = canvas.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    g.scale(dpr, dpr);
    let frame = 0;
    const draw = () => {
      const t = performance.now() / 1000;
      const a = aim.current;
      a.x += (a.tx - a.x) * 0.06;
      a.y += (a.ty - a.y) * 0.06;
      const sky = g.createRadialGradient(SIZE * 0.5, SIZE * 0.45, 20, SIZE / 2, SIZE / 2, SIZE * 0.72);
      sky.addColorStop(0, "#1c2440");
      sky.addColorStop(0.6, "#0f1426");
      sky.addColorStop(1, "#070910");
      g.fillStyle = sky;
      g.fillRect(0, 0, SIZE, SIZE);
      // a faint band of the milky way, drifting
      const band = g.createLinearGradient(0, SIZE, SIZE, 0);
      band.addColorStop(0.35, "rgba(120,110,190,0)");
      band.addColorStop(0.5, "rgba(150,140,220,0.13)");
      band.addColorStop(0.65, "rgba(120,110,190,0)");
      g.fillStyle = band;
      g.fillRect(0, 0, SIZE, SIZE);
      // the three depths of stars, sliding past each other as the lens moves
      LAYERS.forEach((layer, li) => {
        const ox = -a.x * layer.depth + Math.sin(t * 0.05 + li) * layer.depth * 0.3;
        const oy = -a.y * layer.depth + t * 0.6 * (li + 1);
        for (const d of layer.dots) {
          const x = (((d.x * SIZE + ox) % (SIZE * 1.3)) + SIZE * 1.3) % (SIZE * 1.3) - SIZE * 0.15;
          const y = (((d.y * SIZE + oy) % (SIZE * 1.3)) + SIZE * 1.3) % (SIZE * 1.3) - SIZE * 0.15;
          const tw = 0.55 + 0.45 * Math.sin(t * d.rate + d.phase);
          g.globalAlpha = layer.alpha * tw;
          g.fillStyle = li === 2 ? "#fff6dc" : "#dfe6ff";
          g.beginPath();
          g.arc(x, y, d.r, 0, Math.PI * 2);
          g.fill();
        }
      });
      g.globalAlpha = 1;
      // the constellations, on the middle depth
      const cx = -a.x * LAYERS[1].depth;
      const cy = -a.y * LAYERS[1].depth;
      for (const c of CONSTELLATIONS) {
        g.strokeStyle = "rgba(255, 228, 158, 0.22)";
        g.lineWidth = 1;
        g.beginPath();
        for (const [i, j] of c.lines) {
          g.moveTo(c.points[i][0] * SIZE + cx, c.points[i][1] * SIZE + cy);
          g.lineTo(c.points[j][0] * SIZE + cx, c.points[j][1] * SIZE + cy);
        }
        g.stroke();
        c.points.forEach(([px, py], k) => {
          const tw = 0.6 + 0.4 * Math.sin(t * 1.7 + k * 1.3 + px * 10);
          g.fillStyle = `rgba(255, 240, 200, ${0.65 + 0.35 * tw})`;
          g.beginPath();
          g.arc(px * SIZE + cx, py * SIZE + cy, 1.6 + tw * 0.8, 0, Math.PI * 2);
          g.fill();
        });
        g.fillStyle = "rgba(255, 228, 158, 0.35)";
        g.font = "600 9px Fredoka, system-ui, sans-serif";
        g.fillText(c.name, c.points[0][0] * SIZE + cx - 4, c.points[0][1] * SIZE + cy - 8);
      }
      // the shooting star: a bright head and a fading tail
      const s = star.current;
      if (s) {
        const p = (performance.now() - s.at) / (s.duration * 1000);
        if (p > 1.15) star.current = null;
        else {
          const head = { x: (s.x0 + (s.x1 - s.x0) * p) * SIZE, y: (s.y0 + (s.y1 - s.y0) * p) * SIZE };
          const back = Math.max(0, p - 0.18);
          const tail = { x: (s.x0 + (s.x1 - s.x0) * back) * SIZE, y: (s.y0 + (s.y1 - s.y0) * back) * SIZE };
          const fade = p > 1 ? 1 - (p - 1) / 0.15 : 1;
          const grad = g.createLinearGradient(tail.x, tail.y, head.x, head.y);
          grad.addColorStop(0, "rgba(255,240,200,0)");
          grad.addColorStop(1, `rgba(255,248,225,${0.95 * fade})`);
          g.strokeStyle = grad;
          g.lineWidth = 2.6;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(tail.x, tail.y);
          g.lineTo(head.x, head.y);
          g.stroke();
          const glow = g.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
          glow.addColorStop(0, `rgba(255,250,230,${fade})`);
          glow.addColorStop(1, "rgba(255,230,160,0)");
          g.fillStyle = glow;
          g.beginPath();
          g.arc(head.x, head.y, 14, 0, Math.PI * 2);
          g.fill();
        }
      }
      // catches: a ring of sparks and the coins
      bursts.current = bursts.current.filter((b) => performance.now() - b.at < 1400);
      for (const b of bursts.current) {
        const k = (performance.now() - b.at) / 1400;
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          g.fillStyle = `rgba(255, 228, 158, ${1 - k})`;
          g.beginPath();
          g.arc(b.x + Math.cos(ang) * 40 * k, b.y + Math.sin(ang) * 40 * k, 2.2 * (1 - k) + 0.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = `rgba(255, 244, 214, ${1 - k})`;
        g.font = "700 16px Fredoka, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(b.text, b.x, b.y - 18 - 24 * k);
        g.textAlign = "start";
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const toLens = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLens(e);
    aim.current.tx = p.x / SIZE - 0.5;
    aim.current.ty = p.y / SIZE - 0.5;
  };
  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = star.current;
    if (!s || s.hit) return;
    const p = toLens(e);
    const k = Math.min(1, (performance.now() - s.at) / (s.duration * 1000));
    const head = { x: (s.x0 + (s.x1 - s.x0) * k) * SIZE, y: (s.y0 + (s.y1 - s.y0) * k) * SIZE };
    // a generous catch: anywhere near its head, or just behind it along the tail
    if (Math.hypot(p.x - head.x, p.y - head.y) > 42) return;
    s.hit = true;
    lastHit.current = head;
    send({ type: "STAR_CATCH", id: s.id });
    star.current = null;
  };

  return (
    <Modal title="Stargazing" icon="🔭" onClose={onClose} width={400}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <div
          className="relative rounded-full p-[10px]"
          style={{
            width: "min(340px, 78vw)",
            aspectRatio: "1",
            background: "conic-gradient(from 210deg, #7a5a22, #e8c46a, #9a7428, #f3d98c, #7a5a22, #d9b25a, #7a5a22)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,240,200,0.6)",
          }}
        >
          <canvas
            ref={canvas}
            className="block h-full w-full cursor-crosshair touch-none rounded-full"
            style={{ boxShadow: "inset 0 0 28px 10px rgba(0,0,0,0.85)" }}
            onPointerMove={onMove}
            onPointerDown={onTap}
            aria-label="The night sky through the telescope; tap a shooting star to catch it"
          />
          <div className="pointer-events-none absolute inset-[10px] rounded-full" style={{ boxShadow: "inset 0 0 26px 12px rgba(4,6,12,0.9)" }} />
        </div>
        <p className="m-0 text-center text-sm opacity-80">{note}</p>
        <p className="m-0 text-[11px] opacity-60">
          Star Sparks caught: {caught} · each +{STAR_SPARK_COINS} 🪙
        </p>
      </div>
    </Modal>
  );
}
