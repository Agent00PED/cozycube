import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";
import { BALLS, BALL_R, SUBSTEPS, TABLE_H, TABLE_W, flipperTip, launch, newPinballGame, onPlunger, plungerY, setFlipper, stepPinball } from "./pinballSim";

// "Velvet Nights": the vintage pinball machines at the end of Neon Alley's slot row, played on a
// canvas (the table and its physics: pinballSim.ts). Free play for the high score, kept in this
// browser.
//
// Controls: ← / A and → / D (or either Shift) for the flippers, ↓ / S / Space held and let go for
// the plunger. On a touch screen: the left half of the panel is the left flipper, the right half the
// right one, and the plunger is the slider beside the table (pull it down and let go).

interface Props {
  onClose: () => void;
}

const BEST_KEY = "cozy-pinball-best";

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function PinballModal({ onClose }: Props) {
  const [score, setScore] = useState(0);
  const [ball, setBall] = useState(1);
  const [mult, setMult] = useState(1);
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(true);
  const [best, setBest] = useState(readBest);
  const [plungerUi, setPlungerUi] = useState(0);
  const game = useRef(newPinballGame());
  const canvas = useRef<HTMLCanvasElement>(null);

  const newGame = () => {
    game.current = newPinballGame();
    setScore(0);
    setMult(1);
    setBall(1);
    setOver(false);
  };
  const flip = (side: -1 | 1, on: boolean) => setFlipper(game.current, side, on);
  const pull = (on: boolean) => {
    const g = game.current;
    if (on) g.pulling = true;
    else if (g.pulling) launch(g);
  };

  // the keys
  useEffect(() => {
    const L = new Set(["ArrowLeft", "KeyA", "ShiftLeft"]);
    const R = new Set(["ArrowRight", "KeyD", "ShiftRight"]);
    const P = new Set(["ArrowDown", "KeyS", "Space"]);
    const down = (e: KeyboardEvent) => {
      if (e.repeat && (L.has(e.code) || R.has(e.code) || P.has(e.code))) return e.preventDefault();
      if (L.has(e.code)) flip(-1, true);
      else if (R.has(e.code)) flip(1, true);
      else if (P.has(e.code)) pull(true);
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (L.has(e.code)) flip(-1, false);
      else if (R.has(e.code)) flip(1, false);
      else if (P.has(e.code)) pull(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // the machine, every frame: its steps, its sounds, the scoreboard, and the playfield drawn
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const shown = { score: 0, ball: 1, mult: 1, over: false, ready: true, plunger: 0 };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const g = game.current;
      for (let k = 0; k < SUBSTEPS; k++) stepPinball(g, dt / SUBSTEPS);
      for (const [kind, vol] of g.sounds.splice(0)) playSfx(kind, vol);
      if (g.score !== shown.score) setScore((shown.score = g.score));
      if (g.ball !== shown.ball) setBall((shown.ball = g.ball));
      if (g.mult !== shown.mult) setMult((shown.mult = g.mult));
      const isReady = onPlunger(g);
      if (isReady !== shown.ready) setReady((shown.ready = isReady));
      if (g.plunger !== shown.plunger) setPlungerUi((shown.plunger = g.plunger));
      if (g.over !== shown.over) {
        setOver((shown.over = g.over));
        if (g.over) {
          setBest((b) => {
            const nb = Math.max(b, g.score);
            try {
              localStorage.setItem(BEST_KEY, String(nb));
            } catch {
              // storage blocked: the best holds for this visit
            }
            return nb;
          });
        }
      }

      const el = canvas.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const kpx = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(box.width * kpx));
      const H = Math.max(1, Math.round(box.height * kpx));
      if (el.width !== W || el.height !== H) {
        el.width = W;
        el.height = H;
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const s = Math.min(W / TABLE_W, H / TABLE_H);
      const ox = (W - TABLE_W * s) / 2;
      const oy = (H - TABLE_H * s) / 2;
      const X = (x: number) => ox + x * s;
      const Y = (y: number) => oy + y * s;
      ctx.clearRect(0, 0, W, H);
      // the playfield: midnight lacquer with an Art-Deco sunburst
      const bg = ctx.createLinearGradient(0, Y(0), 0, Y(TABLE_H));
      bg.addColorStop(0, "#1a0e2e");
      bg.addColorStop(1, "#0a0712");
      ctx.fillStyle = bg;
      ctx.fillRect(X(0), Y(0), TABLE_W * s, TABLE_H * s);
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = "#e0b04a";
      ctx.lineWidth = Math.max(1, s * 0.004);
      for (let k = 0; k < 14; k++) {
        const a = Math.PI + (Math.PI * k) / 13;
        ctx.beginPath();
        ctx.moveTo(X(0.45), Y(1.2));
        ctx.lineTo(X(0.45 + Math.cos(a) * 0.9), Y(1.2 + Math.sin(a) * 0.9));
        ctx.stroke();
      }
      ctx.restore();
      const T = g.table;
      // walls and guides in neon, the slingshots' faces pink
      ctx.lineCap = "round";
      for (const seg of T.segs) {
        ctx.strokeStyle = seg.kick ? "#ff5fb0" : "#5fe3ff";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = s * 0.012;
        ctx.lineWidth = Math.max(2, seg.r * 2 * s);
        ctx.beginPath();
        ctx.moveTo(X(seg.a.x), Y(seg.a.y));
        ctx.lineTo(X(seg.b.x), Y(seg.b.y));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (const lane of T.lanes) {
        ctx.fillStyle = lane.lit ? "#ffe066" : "rgba(255,224,102,0.18)";
        ctx.beginPath();
        ctx.arc(X(lane.x), Y(0.17), s * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of T.bumpers) {
        b.flash = Math.max(0, b.flash - dt * 4);
        ctx.fillStyle = b.flash > 0 ? "#fff3b0" : "#c8322b";
        ctx.shadowColor = "#ff8a5b";
        ctx.shadowBlur = s * (0.02 + b.flash * 0.05);
        ctx.beginPath();
        ctx.arc(X(b.c.x), Y(b.c.y), b.r * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#f6dc8f";
        ctx.lineWidth = Math.max(2, s * 0.008);
        ctx.stroke();
      }
      for (const t of T.targets) {
        t.flash = Math.max(0, t.flash - dt * 3);
        ctx.strokeStyle = t.down ? "rgba(255,255,255,0.12)" : t.flash > 0 ? "#fff" : "#7dff9a";
        ctx.lineWidth = Math.max(3, s * 0.02);
        ctx.beginPath();
        ctx.moveTo(X(t.a.x), Y(t.a.y));
        ctx.lineTo(X(t.b.x), Y(t.b.y));
        ctx.stroke();
      }
      for (const f of T.flippers) {
        const tip = flipperTip(f);
        ctx.strokeStyle = "#f2c94c";
        ctx.lineWidth = s * 0.036;
        ctx.beginPath();
        ctx.moveTo(X(f.p.x), Y(f.p.y));
        ctx.lineTo(X(tip.x), Y(tip.y));
        ctx.stroke();
        ctx.fillStyle = "#7a4a12";
        ctx.beginPath();
        ctx.arc(X(f.p.x), Y(f.p.y), s * 0.01, 0, Math.PI * 2);
        ctx.fill();
      }
      // the plunger's rod, drawn back as it is pulled
      ctx.fillStyle = "#b9c0c7";
      ctx.fillRect(X(0.9), Y(plungerY(g) + BALL_R), s * 0.04, s * 0.06);
      const grad = ctx.createRadialGradient(X(g.pos.x - 0.008), Y(g.pos.y - 0.008), 1, X(g.pos.x), Y(g.pos.y), BALL_R * s);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#cfd6de");
      grad.addColorStop(1, "#5f6770");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(X(g.pos.x), Y(g.pos.y), BALL_R * s, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // touch (and mouse): the left half of the panel works the left flipper, the right half the right
  const zones = useRef(new Map<number, -1 | 1>());
  const onZoneDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const side: -1 | 1 = e.clientX < box.left + box.width / 2 ? -1 : 1;
    zones.current.set(e.pointerId, side);
    e.currentTarget.setPointerCapture(e.pointerId);
    flip(side, true);
  };
  const onZoneUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const side = zones.current.get(e.pointerId);
    if (side === undefined) return;
    zones.current.delete(e.pointerId);
    if (![...zones.current.values()].includes(side)) flip(side, false);
  };

  // the plunger's slider: drag it down to pull, let go to launch
  const plungerDrag = useRef<{ y0: number; id: number } | null>(null);
  const onPlungerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    plungerDrag.current = { y0: e.clientY, id: e.pointerId };
  };
  const onPlungerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = plungerDrag.current;
    if (!d || d.id !== e.pointerId) return;
    game.current.plunger = Math.max(0, Math.min(1, (e.clientY - d.y0) / 110));
  };
  const onPlungerUp = () => {
    if (!plungerDrag.current) return;
    plungerDrag.current = null;
    launch(game.current);
  };

  const message = over ? "Game over" : ready ? (ball === 1 && score === 0 ? "Pull the plunger to launch" : `Ball ${ball}: pull the plunger`) : "";

  return (
    <Modal landscape title="Velvet Nights Pinball" icon="🕹️" onClose={onClose} tone="velvet" placard="FREE PLAY · 3 BALLS">
      <div className="flex min-h-0 flex-1 gap-3">
        {/* the playfield, the flipper zones over the whole of it: left half, right half */}
        <div className="relative flex min-h-0 flex-1 touch-none select-none items-stretch gap-3" onPointerDown={onZoneDown} onPointerUp={onZoneUp} onPointerCancel={onZoneUp}>
          <div className="flex flex-1 flex-col items-center justify-end gap-2 pb-2 text-center">
            <span className="touch-hint text-xs font-bold uppercase tracking-widest text-amber-200/60">◀ Left flipper</span>
            <span className="kbd-hint text-xs font-bold uppercase tracking-widest text-amber-200/60">← / A</span>
          </div>
          <div className="relative aspect-[1/1.8] h-full rounded-2xl border-4 border-amber-300/70 shadow-[inset_0_0_30px_rgba(0,0,0,0.7)]">
            <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="The pinball playfield" />
            {message && <div className="pointer-events-none absolute inset-x-2 top-[42%] rounded-xl bg-black/60 px-3 py-2 text-center text-sm font-bold text-amber-100">{message}</div>}
          </div>
          <div className="flex flex-1 flex-col items-center justify-end gap-2 pb-2 text-center">
            <span className="touch-hint text-xs font-bold uppercase tracking-widest text-amber-200/60">Right flipper ▶</span>
            <span className="kbd-hint text-xs font-bold uppercase tracking-widest text-amber-200/60">→ / D</span>
          </div>
        </div>

        <div className="flex w-[13rem] shrink-0 flex-col items-center justify-between gap-3 py-1">
          <div className="w-full rounded-2xl border border-amber-300/40 bg-black/50 px-3 py-2 text-center">
            <div className="casino-heading text-[10px] tracking-[0.3em] text-amber-200/70">SCORE</div>
            <div className="casino-numeral text-3xl text-amber-100">{score.toLocaleString("en-US")}</div>
            <div className="mt-1 flex justify-between text-xs opacity-80">
              <span>
                Ball {Math.min(ball, BALLS)}/{BALLS}
              </span>
              <span>×{mult}</span>
            </div>
            <div className="mt-1 text-[11px] opacity-60">Best {best.toLocaleString("en-US")}</div>
          </div>
          {/* the plunger: pull it down, let go */}
          <div
            className={`relative flex h-40 w-14 touch-none select-none flex-col items-center rounded-full border-2 bg-black/50 ${ready ? "border-amber-300/80" : "border-amber-300/30"}`}
            onPointerDown={onPlungerDown}
            onPointerMove={onPlungerMove}
            onPointerUp={onPlungerUp}
            onPointerCancel={onPlungerUp}
            role="slider"
            aria-label="Plunger: pull down and let go"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(plungerUi * 100)}
          >
            <span className="absolute left-1/2 h-12 w-12 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#c8ced6_45%,#6b737c)] shadow-lg" style={{ top: `${6 + plungerUi * 96}px` }} />
            <span className="absolute bottom-2 text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Pull</span>
          </div>
          <span className="kbd-hint text-[11px] opacity-60">Hold ↓ / Space, let go</span>
          {over && (
            <button type="button" onClick={newGame} className="clay-btn clay-btn-amber min-h-12 w-full">
              New game
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
