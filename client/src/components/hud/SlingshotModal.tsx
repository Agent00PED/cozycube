import { useCallback, useEffect, useRef, useState } from "react";
import type { CampfirePacket, SlingshotResult, SlingshotStarted } from "@shared/types";
import { SLINGSHOT_PAID_ROUNDS_PER_HOUR, SLINGSHOT_PRIZES, GOLDEN_ACORN_COINS } from "@shared/economy";
import {
  SLING_ACORN,
  SLING_MAX_DEPTH,
  SLING_RAILS,
  SLING_RELOAD_S,
  SLING_ROUND_S,
  SLING_SHOTS,
  SLING_SPAN,
  SLING_DOWN_S,
  playSlingshot,
  slingAcornX,
  slingMult,
  slingRange,
  slingTargetX,
  type SlingRange,
  type SlingShot,
} from "@shared/slingshot";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Whispering Pines Slingshot Gallery, a cozy carnival booth: paper lanterns strung under a
// striped awning, three rails of painted wooden cutouts gliding across a plank backboard (tin cans
// +50, ducks +150, owls +200) and now and then a Golden Acorn skimming the lanterns (+15 coins). A
// 45-second round of 15 acorns, hitscan: click or tap where the crosshair sits and the acorn is there
// that instant (a 0.08 s tracer from the sling, a pop of splinters, a pop), then a quarter of a
// second while the next acorn is cocked into the pouch. Hits in a row build the combo, up to x4.
//
// The range is the shared seeded sim (shared/slingshot.ts): the targets move here exactly as the
// server will replay them, so what you see hit is what scores. The shots go to the server when the
// round ends (SLINGSHOT_END), which replays and pays them (slingshotResult).

type Phase = "ready" | "starting" | "playing" | "scoring" | "done";

/** A shot's tracer (from the pouch to where it struck, on screen) and its pop, while they last. */
interface Tracer {
  x: number;
  y: number;
  at: number;
}
/** The tracer's life, and the pops' (s). */
const TRACER_S = 0.08;
const POP_S = 0.5;
const LANTERN_COLORS = ["#e2553f", "#f5a623", "#3fa7a0", "#f7d36b", "#c9577d"];

export function SlingshotModal({ send, subscribeMessages, onClose }: { send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [paid, setPaid] = useState(true);
  const [left, setLeft] = useState(SLINGSHOT_PAID_ROUNDS_PER_HOUR);
  const [result, setResult] = useState<SlingshotResult | null>(null);
  const [hud, setHud] = useState({ time: SLING_ROUND_S, shots: SLING_SHOTS, score: 0, mult: 1, acorns: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const game = useRef<{ range: SlingRange | null; seed: number; startAt: number; shots: SlingShot[]; pointer: { x: number; y: number } | null; tracers: Tracer[]; pops: { x: number; y: number; at: number; gold: boolean }[]; ended: boolean; popups: { x: number; y: number; text: string; at: number; gold: boolean }[]; announced: number }>({
    range: null,
    seed: 0,
    startAt: 0,
    shots: [],
    pointer: null,
    tracers: [],
    pops: [],
    ended: false,
    popups: [],
    announced: 0,
  });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sendRef = useRef(send);
  sendRef.current = send;

  const finish = useCallback(() => {
    const g = game.current;
    if (g.ended) return;
    g.ended = true;
    setPhase("scoring");
    sendRef.current({ type: "SLINGSHOT_END", shots: g.shots });
  }, []);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "slingshotStarted") {
          const s = payload as SlingshotStarted;
          const g = game.current;
          g.seed = s.seed;
          g.range = slingRange(s.seed);
          g.startAt = performance.now();
          g.shots = [];
          g.ended = false;
          g.popups = [];
          g.tracers = [];
          g.pops = [];
          g.announced = 0;
          setPaid(s.paid);
          setLeft(s.left);
          setResult(null);
          setHud({ time: SLING_ROUND_S, shots: SLING_SHOTS, score: 0, mult: 1, acorns: 0 });
          setPhase("playing");
        } else if (type === "slingshotResult") {
          const r = payload as SlingshotResult;
          setResult(r);
          setPhase("done");
          if (r.eagle) playSfx("trophy");
          else if (r.coins > 0) playSfx("coins");
        }
      }),
    [subscribeMessages]
  );

  const start = () => {
    if (phaseRef.current === "starting" || phaseRef.current === "playing" || phaseRef.current === "scoring") return;
    setPhase("starting");
    send({ type: "SLINGSHOT_START" });
  };
  // no answer (walked off, the server said no): back to the start
  useEffect(() => {
    if (phase !== "starting") return;
    const t = window.setTimeout(() => setPhase("ready"), 3000);
    return () => window.clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== "scoring") return;
    const t = window.setTimeout(() => setPhase("done"), 5000);
    return () => window.clearTimeout(t);
  }, [phase]);

  // --- the range's geometry: the rails recede up the canvas, smaller with distance ---------------
  const geom = (w: number, h: number) => {
    const baseY = h * 0.78; // the near rail
    const topY = h * 0.24; // the acorn's lane, under the lanterns
    const yOf = (d: number) => baseY - (baseY - topY) * (1 - 1 / (1 + d * 0.55)) / (1 - 1 / (1 + SLING_MAX_DEPTH * 0.55));
    const scaleOf = (d: number) => 1 / (1 + d * 0.33);
    const xOf = (x: number, d: number) => w / 2 + (x / SLING_SPAN) * (w * 0.46) * scaleOf(d);
    const pouch = { x: w / 2, y: h * 0.95 };
    // the inverse, for a click: where on the range a screen point is
    const toRange = (sx: number, sy: number) => {
      let lo = 0;
      let hi = SLING_MAX_DEPTH;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (yOf(mid) > sy) lo = mid;
        else hi = mid;
      }
      const d = (lo + hi) / 2;
      return { x: ((sx - w / 2) / (w * 0.46) / scaleOf(d)) * SLING_SPAN, d };
    };
    return { yOf, scaleOf, xOf, pouch, toRange };
  };

  /** A shot at a point on the screen: hitscan, it strikes there the instant it's loosed. */
  const shoot = (sx: number, sy: number) => {
    const g = game.current;
    const c = canvasRef.current;
    if (phaseRef.current !== "playing" || !g.range || g.ended || !c) return;
    const t = (performance.now() - g.startAt) / 1000;
    if (t > SLING_ROUND_S || g.shots.length >= SLING_SHOTS) return;
    const last = g.shots[g.shots.length - 1];
    if (last && t < last.t + SLING_RELOAD_S) return; // (the next acorn is still being cocked)
    const aim = geom(c.clientWidth, c.clientHeight).toRange(sx, sy);
    g.shots.push({ t: Math.round(t * 1000) / 1000, x: Math.max(-SLING_SPAN - 0.1, Math.min(SLING_SPAN + 0.1, aim.x)), d: Math.max(0, Math.min(SLING_MAX_DEPTH, aim.d)) });
    g.tracers.push({ x: sx, y: sy, at: performance.now() });
    playSfx("twang");
  };

  // --- input: the crosshair follows the pointer; a click or a tap shoots there -------------------
  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    const at = pointAt(e);
    game.current.pointer = at;
    shoot(at.x, at.y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    game.current.pointer = pointAt(e);
  };

  // --- the frame loop: the range, the targets, the stones in flight, the aim -----------------------
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = game.current;
      const { yOf, scaleOf, xOf, pouch } = geom(w, h);
      const playing = phaseRef.current === "playing" && !!g.range;
      const t = playing ? (performance.now() - g.startAt) / 1000 : 0;
      // the booth: a warm night sky over the pines, a plank backboard behind the far rail, straw
      // on the boards up to the counter, a striped awning and a string of paper lanterns
      const horizon = yOf(SLING_RAILS[SLING_RAILS.length - 1].depth) - 10;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#241a33");
      sky.addColorStop(1, "#5a3b3a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = "#1d2a22";
      for (let i = 0; i < 20; i++) {
        const px = (i / 19) * w;
        const ph = h * (0.08 + ((i * 37) % 11) / 130);
        ctx.beginPath();
        ctx.moveTo(px - 26, horizon - h * 0.05);
        ctx.lineTo(px, horizon - h * 0.05 - ph);
        ctx.lineTo(px + 26, horizon - h * 0.05);
        ctx.fill();
      }
      // the backboard: warm planks, lit from the lanterns
      const boardTop = horizon - h * 0.06;
      const planks = ctx.createLinearGradient(0, boardTop, 0, horizon + 16);
      planks.addColorStop(0, "#8a5a36");
      planks.addColorStop(1, "#6b4428");
      ctx.fillStyle = planks;
      ctx.fillRect(0, boardTop, w, horizon + 16 - boardTop);
      ctx.strokeStyle = "rgba(40, 24, 12, 0.45)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const py = boardTop + ((horizon + 16 - boardTop) * i) / 4;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }
      const floor = ctx.createLinearGradient(0, horizon + 16, 0, h);
      floor.addColorStop(0, "#7a5634");
      floor.addColorStop(1, "#a07448");
      ctx.fillStyle = floor;
      ctx.fillRect(0, horizon + 16, w, h - horizon - 16);
      ctx.strokeStyle = "rgba(60, 36, 18, 0.35)";
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + i * w * 0.02, horizon + 16);
        ctx.lineTo(w / 2 + i * w * 0.11, h);
        ctx.stroke();
      }
      // the awning's stripes and scalloped edge
      const awningH = h * 0.07;
      const stripes = 14;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? "#f3e6cf" : "#c2463a";
        ctx.fillRect((i * w) / stripes, 0, w / stripes + 1, awningH);
        ctx.beginPath();
        ctx.arc(((i + 0.5) * w) / stripes, awningH, w / stripes / 2, 0, Math.PI);
        ctx.fill();
      }
      // the lanterns, swaying on their string
      const now = performance.now() / 1000;
      const lanterns = 9;
      ctx.strokeStyle = "#3a2a20";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const ly = awningH + h * 0.05 + Math.sin(u * Math.PI) * h * 0.045;
        if (i === 0) ctx.moveTo(u * w, ly);
        else ctx.lineTo(u * w, ly);
      }
      ctx.stroke();
      for (let i = 0; i < lanterns; i++) {
        const u = (i + 0.5) / lanterns;
        const lx = u * w + Math.sin(now * 1.3 + i) * 2;
        const ly = awningH + h * 0.05 + Math.sin(u * Math.PI) * h * 0.045 + h * 0.03;
        const r = Math.max(7, h * 0.026);
        const col = LANTERN_COLORS[i % LANTERN_COLORS.length];
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 3.2);
        glow.addColorStop(0, "rgba(255, 200, 120, 0.35)");
        glow.addColorStop(1, "rgba(255, 200, 120, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(lx - r * 3.2, ly - r * 3.2, r * 6.4, r * 6.4);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(lx, ly, r * 0.85, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(40, 20, 10, 0.4)";
        for (const k of [-0.45, 0, 0.45]) {
          ctx.beginPath();
          ctx.ellipse(lx + k * r * 0.85, ly, r * 0.12, r * 0.95, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#3a2a20";
        ctx.fillRect(lx - r * 0.35, ly - r * 1.12, r * 0.7, r * 0.22);
        ctx.fillRect(lx - r * 0.35, ly + r * 0.92, r * 0.7, r * 0.2);
      }
      const range = g.range ?? slingRange(1);
      const run = playing ? playSlingshot(g.seed, g.shots.filter((s) => s.t <= t)) : null;
      const downUntil = new Map<string, number>();
      if (run) for (const hit of run.hits) if (hit.rail >= 0) downUntil.set(`${hit.rail}:${hit.target}`, hit.at + SLING_DOWN_S);
      // the rails, far to near, and their targets
      for (let ri = SLING_RAILS.length - 1; ri >= 0; ri--) {
        const R = SLING_RAILS[ri];
        const y = yOf(R.depth);
        const s = scaleOf(R.depth);
        // a wooden rail with a brass cap
        ctx.fillStyle = "#4a3020";
        ctx.fillRect(xOf(-SLING_SPAN, R.depth), y, xOf(SLING_SPAN, R.depth) - xOf(-SLING_SPAN, R.depth), 6 * s);
        ctx.fillStyle = "#d9a843";
        ctx.fillRect(xOf(-SLING_SPAN, R.depth), y - 1, xOf(SLING_SPAN, R.depth) - xOf(-SLING_SPAN, R.depth), 2);
        for (let i = 0; i < R.count; i++) {
          const x = slingTargetX(range, ri, i, t);
          const sx = xOf(x, R.depth);
          const down = (downUntil.get(`${ri}:${i}`) ?? -1) > t;
          drawTarget(ctx, R.kind, sx, y, (R.radius / SLING_SPAN) * w * 0.46 * s, down);
        }
      }
      // the Golden Acorn skimming the branches
      for (let k = 0; k < range.acorns.length; k++) {
        const x = slingAcornX(range, k, t);
        if (x === null || run?.hits.some((h) => h.rail < 0 && h.target === k)) continue;
        const sx = xOf(x, SLING_ACORN.depth);
        const sy = yOf(SLING_ACORN.depth) + Math.sin(t * 9) * 3;
        drawAcorn(ctx, sx, sy, (SLING_ACORN.radius / SLING_SPAN) * w * 0.46 * scaleOf(SLING_ACORN.depth), t);
      }
      // each shot's tracer: a bright streak from the pouch to where it struck, gone in 0.08 s
      const pn = performance.now();
      g.tracers = g.tracers.filter((tr) => pn - tr.at < TRACER_S * 1000);
      for (const tr of g.tracers) {
        const a = 1 - (pn - tr.at) / (TRACER_S * 1000);
        ctx.strokeStyle = `rgba(255, 236, 190, ${a})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255, 200, 120, 0.9)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(pouch.x, pouch.y - 26);
        ctx.lineTo(tr.x, tr.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // the pops: a ring of splinters where a target was struck
      g.pops = g.pops.filter((p) => pn - p.at < POP_S * 1000);
      for (const p of g.pops) {
        const u = (pn - p.at) / (POP_S * 1000);
        ctx.globalAlpha = 1 - u;
        ctx.strokeStyle = p.gold ? "#ffd35a" : "#fff3dc";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + u * 26, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + 0.3;
          const dist = 8 + u * 30;
          ctx.fillStyle = k % 2 ? "#c98b4f" : p.gold ? "#ffd35a" : "#e2553f";
          ctx.fillRect(p.x + Math.cos(ang) * dist - 2, p.y + Math.sin(ang) * dist + u * u * 18 - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
      // the new hits: a score pop where each struck
      if (run && run.hits.length > g.announced) {
        for (const hit of run.hits.slice(g.announced)) {
          const d = hit.rail < 0 ? SLING_ACORN.depth : SLING_RAILS[hit.rail].depth;
          g.popups.push({ x: xOf(hit.x, d), y: yOf(d) - 20, text: hit.rail < 0 ? `🌰 +${hit.points} · +${GOLDEN_ACORN_COINS}🪙` : `+${hit.points}${hit.mult > 1 ? ` x${hit.mult}` : ""}`, at: performance.now(), gold: hit.rail < 0 || hit.mult >= 3 });
          g.pops.push({ x: xOf(hit.x, d), y: yOf(d) - 10 * scaleOf(d), at: performance.now(), gold: hit.rail < 0 });
          playSfx("pop");
          if (hit.rail < 0) playSfx("golden");
        }
        g.announced = run.hits.length;
      }
      g.popups = g.popups.filter((p) => performance.now() - p.at < 900);
      for (const p of g.popups) {
        const a = (performance.now() - p.at) / 900;
        ctx.globalAlpha = 1 - a;
        ctx.fillStyle = p.gold ? "#F5A623" : "#F7EBE1";
        ctx.font = "800 18px Fredoka, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y - a * 30);
        ctx.globalAlpha = 1;
      }
      // the crosshair where the pointer is, and the sling (its next acorn being cocked for a quarter
      // of a second after each shot)
      if (playing && g.pointer) {
        const { x: cx, y: cy } = g.pointer;
        ctx.strokeStyle = "rgba(255, 244, 220, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(cx + dx * 6, cy + dy * 6);
          ctx.lineTo(cx + dx * 17, cy + dy * 17);
        }
        ctx.stroke();
        ctx.fillStyle = "#f5a623";
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const lastShot = g.shots[g.shots.length - 1];
      const cock = !playing || !lastShot ? 1 : Math.max(0, Math.min(1, (t - lastShot.t) / SLING_RELOAD_S));
      const out = g.shots.length >= SLING_SHOTS;
      drawSling(ctx, pouch.x, pouch.y, cock, out);
      // the HUD's numbers (a React update a few times a second, not every frame)
      if (playing) {
        const time = Math.max(0, SLING_ROUND_S - t);
        const shotsLeft = SLING_SHOTS - g.shots.length;
        const all = playSlingshot(g.seed, g.shots.filter((s) => s.t <= t));
        let streak = 0;
        for (let i = g.shots.length - 1; i >= 0; i--) {
          const landed = g.shots[i].t <= t;
          if (!landed) continue;
          if (all.hits.some((hh) => hh.shot === i)) streak++;
          else break;
        }
        setHud((prev) => {
          const next = { time: Math.ceil(time), shots: shotsLeft, score: all.score, mult: slingMult(streak), acorns: all.acorns };
          return prev.time === next.time && prev.shots === next.shots && prev.score === next.score && prev.mult === next.mult && prev.acorns === next.acorns ? prev : next;
        });
        // the round's end: the clock, or the last acorn loosed (and its pop seen)
        const lastLanded = g.shots.length >= SLING_SHOTS && t >= g.shots[g.shots.length - 1].t + 0.4;
        if (t >= SLING_ROUND_S || lastLanded) finish();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // geom and finish are stable enough (read through refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier = result ? SLINGSHOT_PRIZES.find((p) => result.score >= p.score) : null;
  // closing mid-round still counts the stones already thrown
  const close = () => {
    if (phaseRef.current === "playing") finish();
    onClose();
  };
  return (
    <Modal title="Whispering Pines Carnival Gallery" icon="🎪" onClose={close} landscape width={1100}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        {/* the round's numbers */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="cozy-pill rounded-full px-3 py-1 font-bold tabular-nums">⏱ {hud.time}s</span>
          <span className="cozy-pill flex items-center gap-0.5 rounded-full px-3 py-1" aria-label={`${hud.shots} acorns left`}>
            {Array.from({ length: SLING_SHOTS }, (_, i) => (
              <span key={i} className={`inline-block h-2.5 w-2.5 rounded-full ${i < hud.shots ? "bg-[#C98B4F]" : "bg-white/10"}`} />
            ))}
          </span>
          <span className="cozy-pill rounded-full px-3 py-1 font-extrabold tabular-nums text-[#F7EBE1]">⭐ {hud.score.toLocaleString("en-US")}</span>
          <span className={`rounded-full px-3 py-1 font-extrabold ${hud.mult > 1 ? "bg-[#F5A623] text-[#2B201B]" : "cozy-pill"}`}>Combo x{hud.mult}</span>
          {hud.acorns > 0 && <span className="cozy-pill rounded-full px-3 py-1 font-bold text-[#F5A623]">🌰 ×{hud.acorns}</span>}
          <span className="ml-auto text-xs opacity-75">{paid ? `Playing for coins · ${left} paid rounds left this hour` : "Just for fun this round (the hour's paid rounds are used up)"}</span>
        </div>
        {/* the range */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#4A3A30]">
          <canvas ref={canvasRef} className="h-full w-full" style={{ touchAction: "none", cursor: phase === "playing" ? "none" : "default" }} onPointerDown={onDown} onPointerMove={onMove} onPointerLeave={() => (game.current.pointer = null)} aria-label="The carnival range: click or tap a target to shoot it" />
          {phase !== "playing" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1C1614]/70 p-4 backdrop-blur-[2px]">
              {phase === "done" && result ? (
                <div className="cozy-card clay-pop flex w-full max-w-[420px] flex-col items-center gap-1.5 rounded-[20px] px-5 py-4 text-center">
                  <span className="text-4xl">{result.eagle ? "🦅" : result.hits >= 10 ? "🎯" : "🌰"}</span>
                  <b className="text-2xl text-[#F7EBE1]">{result.ok ? `${result.score.toLocaleString("en-US")} points` : "That round didn't count"}</b>
                  {result.ok && (
                    <span className="text-sm opacity-85">
                      {result.hits} hits · best run {result.streak} · {result.acorns} Golden Acorn{result.acorns === 1 ? "" : "s"} · personal best {result.best.toLocaleString("en-US")}
                    </span>
                  )}
                  {result.ok && result.paid && <span className="text-base font-bold text-[#F5A623]">{result.coins > 0 ? `+${result.coins} 🪙` : tier ? "No coins left in today's gallery purse" : `Score ${SLINGSHOT_PRIZES[SLINGSHOT_PRIZES.length - 1].score}+ for a prize`}</span>}
                  {result.capped && <span className="text-xs opacity-70">(today's gallery coins are nearly all won)</span>}
                  {result.eagle && <span className="text-sm font-bold text-[#8fd3b6]">🦅 Eagle Eye for 10 minutes: a wider golden ring when felling, a wider green on the reel</span>}
                  <button type="button" className="clay-btn clay-btn-amber mt-2 min-h-11 px-6" onClick={start}>
                    🎯 Another round
                  </button>
                </div>
              ) : phase === "scoring" ? (
                <b className="text-lg text-[#F7EBE1]">Counting the targets…</b>
              ) : (
                <div className="cozy-card flex w-full max-w-[460px] flex-col gap-2 rounded-[20px] px-5 py-4 text-center">
                  <b className="text-xl text-[#F7EBE1]">Step right up to the booth!</b>
                  <p className="m-0 text-sm opacity-85">45 seconds, {SLING_SHOTS} acorns. Click or tap a target: the acorn is there in a flash (no leading needed), and the next one is cocked in a quarter of a second.</p>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🥫 Wooden cans +50</span>
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🦆 Ducks +150</span>
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🦉 Owls +200</span>
                  </div>
                  <p className="m-0 text-xs opacity-75">
                    Hits in a row build a combo up to x4. The 🌰 Golden Acorn pays {GOLDEN_ACORN_COINS} 🪙 on the spot. Prizes: {SLINGSHOT_PRIZES.map((p) => `${p.score.toLocaleString("en-US")}+ → ${p.coins} 🪙${p.eagle ? " & 🦅 Eagle Eye" : ""}`).reverse().join(" · ")}
                  </p>
                  <button type="button" className="clay-btn clay-btn-amber min-h-11" disabled={phase === "starting"} onClick={start}>
                    {phase === "starting" ? "Filling the acorn pouch…" : "🎯 Start the round"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function drawTarget(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, down: boolean) {
  ctx.save();
  ctx.translate(x, y);
  // the peg it rides on, and every cutout's plywood edge (a dark outline round the paint)
  ctx.fillStyle = "#4a3222";
  ctx.fillRect(-1.5, -2, 3, 8);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  if (down) {
    // knocked flat: just its edge on the rail
    ctx.fillStyle = "rgba(20, 16, 14, 0.6)";
    ctx.fillRect(-r, -4, r * 2, 4);
    ctx.restore();
    return;
  }
  if (kind === "can") {
    ctx.strokeRect(-r * 0.7, -r * 2.2, r * 1.4, r * 2.2);
    ctx.fillStyle = "#d8cdb8";
    ctx.fillRect(-r * 0.7, -r * 2.2, r * 1.4, r * 2.2);
    ctx.fillStyle = "#c2463a";
    ctx.fillRect(-r * 0.72, -r * 1.5, r * 1.44, r * 0.8);
    ctx.fillStyle = "#f3e6cf";
    ctx.beginPath();
    ctx.arc(0, -r * 1.1, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "duck") {
    ctx.fillStyle = "#f4d35e";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.8, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.7, -r * 1.6, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f29a38";
    ctx.beginPath();
    ctx.moveTo(r * 1.1, -r * 1.65);
    ctx.lineTo(r * 1.6, -r * 1.5);
    ctx.lineTo(r * 1.1, -r * 1.4);
    ctx.fill();
    ctx.fillStyle = "#1e1b1a";
    ctx.beginPath();
    ctx.arc(r * 0.85, -r * 1.75, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#8a6446";
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.2, r * 0.9, r * 1.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = "#d9c09a";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.9, r * 0.55, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#f4c542";
      ctx.beginPath();
      ctx.arc(s * r * 0.38, -r * 1.75, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e1b1a";
      ctx.beginPath();
      ctx.arc(s * r * 0.38, -r * 1.75, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawAcorn(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 6) * 0.3);
  ctx.shadowColor = "rgba(245, 166, 35, 0.9)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#f5c04a";
  ctx.beginPath();
  ctx.ellipse(0, r * 0.3, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#8a5a2a";
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.45, r * 0.95, r * 0.45, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-1.5, -r * 1.05, 3, r * 0.4);
  ctx.restore();
}

/** The slingshot at the counter: its wooden fork and band; `cock` (0 to 1) draws the next acorn
 *  into the pouch after a shot (the band pulled back as it settles), and `out` leaves it empty. */
function drawSling(ctx: CanvasRenderingContext2D, x: number, y: number, cock: number, out: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#5e4230";
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(0, 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(-26, -34);
  ctx.moveTo(0, 0);
  ctx.lineTo(26, -34);
  ctx.stroke();
  // the band snaps forward on a shot and is drawn back as the next acorn is cocked
  const pull = Math.sin(Math.min(1, cock) * Math.PI * 0.5) * 12;
  ctx.strokeStyle = "#c2463a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-26, -34);
  ctx.lineTo(0, -34 + pull);
  ctx.lineTo(26, -34);
  ctx.stroke();
  if (!out && cock > 0.05) {
    const s = 0.3 + 0.7 * Math.min(1, cock);
    ctx.save();
    ctx.translate(0, -34 + pull);
    ctx.scale(s, s);
    ctx.fillStyle = "#b07a3c";
    ctx.beginPath();
    ctx.ellipse(0, 2, 6, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4526";
    ctx.beginPath();
    ctx.ellipse(0, -3, 7, 3.6, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
