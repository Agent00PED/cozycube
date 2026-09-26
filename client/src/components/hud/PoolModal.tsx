import { useEffect, useRef, useState } from "react";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Velvet Lounge's 8-ball table, from above: a game of solo 8-ball on a canvas, for the love of
// the game (no chips). Point behind the cue ball to aim (the cue lies on the pointer's side, the
// line shows where the ball goes), press and pull back, and let go: the further the pull, the
// harder the shot (the meter under the table). The
// first ball you pot makes that group yours (solids or stripes); clear it and sink the 8 to win.
// Potting the 8 early loses the rack; scratching puts the cue ball back on the spot. The break is
// shown in the hall too (the 3D cue ball breaks the rack: onBreak).

interface Props {
  onBreak: () => void;
  onClose: () => void;
}

const W = 800;
const H = 420;
const RAIL = 26;
const R = 10.5;
const POCKET = 19;
const FRICTION = 0.985; // per 1/120 s
const STOP = 3;
const MAX_POWER = 1150;
const BEST_KEY = "cozy-pool-best";

const COLORS = ["#f4f1ea", "#f2c230", "#2f5fd0", "#d8322b", "#6a3aa8", "#f07c1c", "#1f8a4c", "#7a1f2e", "#141414"];
const colorOf = (n: number) => COLORS[n === 0 ? 0 : n === 8 ? 8 : ((n - 1) % 8) + 1];

interface Ball {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  in: boolean;
}

const POCKETS = [
  [RAIL, RAIL],
  [W / 2, RAIL - 4],
  [W - RAIL, RAIL],
  [RAIL, H - RAIL],
  [W / 2, H - RAIL + 4],
  [W - RAIL, H - RAIL],
];
const HEAD = { x: RAIL + (W - 2 * RAIL) * 0.25, y: H / 2 };

function rack(): Ball[] {
  // the triangle: the 8 in the middle of the third row, a solid and a stripe in the back corners
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const balls: Ball[] = [{ n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false }];
  const fx = RAIL + (W - 2 * RAIL) * 0.72;
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) balls.push({ n: order[k++], x: fx + row * R * 1.76, y: H / 2 + (i - row / 2) * (R * 2 + 0.6), vx: 0, vy: 0, in: false });
  return balls;
}

type Group = "solids" | "stripes" | null;
const groupOf = (n: number): Group => (n >= 1 && n <= 7 ? "solids" : n >= 9 ? "stripes" : null);

export function PoolModal({ onBreak, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>(rack());
  const aim = useRef<{ x: number; y: number; power: number } | null>(null);
  const moving = useRef(false);
  const shotPotted = useRef<number[]>([]);
  const broke = useRef(false);
  const lastClack = useRef(0);
  const [group, setGroup] = useState<Group>(null);
  const groupRef = useRef<Group>(null);
  groupRef.current = group;
  const [shots, setShots] = useState(0);
  const shotsRef = useRef(0);
  shotsRef.current = shots;
  const [say, setSay] = useState("Point behind the cue ball, press, pull back and let go to break");
  const [power, setPower] = useState(0);
  const [best, setBest] = useState<number | null>(() => {
    try {
      const v = Number(window.localStorage.getItem(BEST_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });

  const reset = (text: string) => {
    balls.current = rack();
    broke.current = false;
    setGroup(null);
    setShots(0);
    setSay(text);
  };

  // --- the shot's end: what went down, and what it means ---
  const settle = () => {
    const potted = shotPotted.current;
    shotPotted.current = [];
    const cue = balls.current[0];
    const scratch = cue.in;
    if (scratch) {
      Object.assign(cue, { x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false });
      // the spot taken: nudge along until it's clear
      while (balls.current.some((b) => b !== cue && !b.in && Math.hypot(b.x - cue.x, b.y - cue.y) < R * 2.1)) cue.y += R * 2.2;
    }
    let g = groupRef.current;
    const firstGroup = potted.map(groupOf).find((x) => x);
    if (!g && firstGroup) {
      g = firstGroup;
      setGroup(g);
    }
    const mineLeft = balls.current.filter((b) => !b.in && g && groupOf(b.n) === g).length;
    if (potted.includes(8)) {
      if (g && mineLeft === 0 && !scratch) {
        const n = shotsRef.current;
        setSay(`You cleared the table in ${n} shot${n > 1 ? "s" : ""}! 🎱`);
        playSfx("jackpot");
        if (!best || n < best) {
          setBest(n);
          try {
            window.localStorage.setItem(BEST_KEY, String(n));
          } catch {
            // private mode: the record just isn't kept
          }
        }
        window.setTimeout(() => reset("A fresh rack: break when you're ready"), 2600);
      } else {
        setSay("The 8 went down early: that rack's lost. Racking up again…");
        window.setTimeout(() => reset("A fresh rack: break when you're ready"), 2200);
      }
      return;
    }
    if (scratch) setSay("Scratch! The cue ball goes back on the spot");
    else if (potted.length) setSay(`Down: ${potted.map((n) => `#${n}`).join(", ")}${g ? ` · ${mineLeft} of your ${g} left` : ""}`);
    else setSay(g ? `${mineLeft} of your ${g} left${mineLeft === 0 ? ": now the 8!" : ""}` : "Nothing down: pot a ball to pick your group");
  };

  // --- the physics and the drawing, every frame ---
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (dt: number) => {
      const bs = balls.current.filter((b) => !b.in);
      for (const b of bs) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= FRICTION;
        b.vy *= FRICTION;
        if (Math.hypot(b.vx, b.vy) < STOP) b.vx = b.vy = 0;
        // the pockets
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < POCKET) {
            b.in = true;
            b.vx = b.vy = 0;
            shotPotted.current.push(b.n);
            playSfx("pocket", 0.8);
            break;
          }
        }
        if (b.in) continue;
        // the cushions
        if (b.x < RAIL + R) (b.x = RAIL + R), (b.vx = Math.abs(b.vx) * 0.78);
        if (b.x > W - RAIL - R) (b.x = W - RAIL - R), (b.vx = -Math.abs(b.vx) * 0.78);
        if (b.y < RAIL + R) (b.y = RAIL + R), (b.vy = Math.abs(b.vy) * 0.78);
        if (b.y > H - RAIL - R) (b.y = H - RAIL - R), (b.vy = -Math.abs(b.vy) * 0.78);
      }
      // ball on ball: equal masses, nearly elastic
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i];
          const b = bs[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= R * 2 || d === 0) continue;
          const nx = dx / d;
          const ny = dy / d;
          const overlap = R * 2 - d;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel <= 0) continue;
          const imp = rel * 0.97;
          a.vx -= imp * nx;
          a.vy -= imp * ny;
          b.vx += imp * nx;
          b.vy += imp * ny;
          const now = performance.now();
          if (now - lastClack.current > 45) {
            lastClack.current = now;
            playSfx("clack", Math.min(1, rel / 700));
          }
        }
    };
    const draw = () => {
      // the rails, the felt, the pockets, the head string
      ctx.fillStyle = "#5a2d14";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#1d7a45";
      ctx.fillRect(RAIL, RAIL, W - 2 * RAIL, H - 2 * RAIL);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(HEAD.x, RAIL);
      ctx.lineTo(HEAD.x, H - RAIL);
      ctx.stroke();
      ctx.fillStyle = "#d9b25a";
      for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
        ctx.beginPath();
        ctx.arc(RAIL + (W - 2 * RAIL) * t, RAIL / 2, 2.4, 0, Math.PI * 2);
        ctx.arc(RAIL + (W - 2 * RAIL) * t, H - RAIL / 2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [px, py] of POCKETS) {
        ctx.fillStyle = "#0b0b0b";
        ctx.beginPath();
        ctx.arc(px, py, POCKET, 0, Math.PI * 2);
        ctx.fill();
      }
      // the balls
      for (const b of balls.current) {
        if (b.in) continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = b.n >= 9 ? "#f4f1ea" : colorOf(b.n);
        ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
        if (b.n >= 9) {
          ctx.fillStyle = colorOf(b.n);
          ctx.fillRect(b.x - R, b.y - R * 0.55, R * 2, R * 1.1);
        }
        ctx.restore();
        if (b.n > 0) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(b.x, b.y, R * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#111";
          ctx.font = "bold 7px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(b.n), b.x, b.y + 0.3);
        }
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(b.x - R * 0.35, b.y - R * 0.35, R * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      // the cue and the aim line
      const cue = balls.current[0];
      const a = aim.current;
      if (a && !moving.current && !cue.in) {
        const dx = cue.x - a.x;
        const dy = cue.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + ux * 260, cue.y + uy * 260);
        ctx.stroke();
        ctx.setLineDash([]);
        const back = 16 + a.power * 60;
        ctx.strokeStyle = "#c8934a";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cue.x - ux * back, cue.y - uy * back);
        ctx.lineTo(cue.x - ux * (back + 230), cue.y - uy * (back + 230));
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    };
    const frame = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      while (acc >= 1 / 120) {
        step(1 / 120);
        acc -= 1 / 120;
      }
      const still = balls.current.every((b) => b.in || (b.vx === 0 && b.vy === 0));
      if (moving.current && still) {
        moving.current = false;
        settle();
      }
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- aiming with the pointer: drag back, let go ---
  const toTable = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (moving.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = toTable(e);
    aim.current = { ...start.current, power: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (moving.current) return;
    // the cue lies on the pointer's side of the cue ball, the shot goes away from it; the further
    // the pull from where you pressed, the harder
    const p = toTable(e);
    const pw = start.current ? Math.min(1, Math.hypot(p.x - start.current.x, p.y - start.current.y) / 180) : 0;
    aim.current = { x: p.x, y: p.y, power: pw };
    setPower(pw);
  };
  const onUp = () => {
    const a = aim.current;
    start.current = null;
    setPower(0);
    if (!a || moving.current || a.power < 0.04) return;
    const cue = balls.current[0];
    const dx = cue.x - a.x;
    const dy = cue.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    cue.vx = (dx / d) * a.power * MAX_POWER;
    cue.vy = (dy / d) * a.power * MAX_POWER;
    aim.current = null;
    moving.current = true;
    playSfx("clack", 0.4 + a.power * 0.6);
    setShots((n) => n + 1);
    if (!broke.current) {
      broke.current = true;
      onBreak();
    }
  };

  const left = (g: Group) => balls.current.filter((b) => !b.in && groupOf(b.n) === g).length;

  return (
    <Modal title="The 8-Ball Table" icon="🎱" onClose={onClose} width={640} tone="felt">
      <div className="flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold">
            {group ? (
              <>
                You're on <b className="text-amber-200">{group}</b> ({left(group)} left)
              </>
            ) : (
              "Open table"
            )}
          </span>
          <span className="opacity-70">
            Shots: {shots}
            {best ? ` · best clear: ${best}` : ""}
          </span>
        </div>
        <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="w-full touch-none rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.5)]" style={{ aspectRatio: `${W} / ${H}`, cursor: "crosshair" }} aria-label="The pool table: drag back to aim and shoot" />
        {/* the power meter */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500" style={{ width: `${power * 100}%` }} />
        </div>
        <div className="text-center text-sm font-bold text-amber-100" role="status">
          {say}
        </div>
        <div className="flex justify-center">
          <button type="button" onClick={() => reset("A fresh rack: break when you're ready")} className="clay-btn clay-btn-ghost min-h-9 px-4 text-xs">
            Re-rack
          </button>
        </div>
      </div>
    </Modal>
  );
}
