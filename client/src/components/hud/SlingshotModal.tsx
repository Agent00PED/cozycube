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
  slingFlight,
  slingMult,
  slingRange,
  slingTargetX,
  type SlingRange,
  type SlingShot,
} from "@shared/slingshot";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Whispering Pines Slingshot Gallery: a 45-second round, 15 stones, three rails of wooden
// targets gliding across the range (tin cans +50, ducks +150, owls +200) and now and then a Golden
// Acorn skimming the branches (+15 coins). Pull back on the sling (drag the mouse, or your thumb)
// and a line of dots shows where the stone will fly; let go to loose it (a plain click or tap shoots
// straight at that spot). Hits in a row build the combo, up to x4.
//
// The range is the shared seeded sim (shared/slingshot.ts): the targets move here exactly as the
// server will replay them, so what you see hit is what scores. The shots go to the server when the
// round ends (SLINGSHOT_END), which replays and pays them (slingshotResult).

type Phase = "ready" | "starting" | "playing" | "scoring" | "done";

interface Flight {
  shot: SlingShot;
  n: number;
}

const PULL_PX = 170;

export function SlingshotModal({ send, subscribeMessages, onClose }: { send: (packet: CampfirePacket) => void; subscribeMessages: (listener: RoomMessageListener) => () => void; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [paid, setPaid] = useState(true);
  const [left, setLeft] = useState(SLINGSHOT_PAID_ROUNDS_PER_HOUR);
  const [result, setResult] = useState<SlingshotResult | null>(null);
  const [hud, setHud] = useState({ time: SLING_ROUND_S, shots: SLING_SHOTS, score: 0, mult: 1, acorns: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const game = useRef<{ range: SlingRange | null; seed: number; startAt: number; shots: SlingShot[]; drag: { x0: number; y0: number; x: number; y: number } | null; aim: { x: number; d: number } | null; ended: boolean; popups: { x: number; y: number; text: string; at: number; gold: boolean }[]; announced: number }>({
    range: null,
    seed: 0,
    startAt: 0,
    shots: [],
    drag: null,
    aim: null,
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
    const topY = h * 0.18; // the acorn's lane
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

  const shoot = (aim: { x: number; d: number }) => {
    const g = game.current;
    if (phaseRef.current !== "playing" || !g.range || g.ended) return;
    const t = (performance.now() - g.startAt) / 1000;
    if (t > SLING_ROUND_S || g.shots.length >= SLING_SHOTS) return;
    const last = g.shots[g.shots.length - 1];
    if (last && t < last.t + SLING_RELOAD_S) return;
    g.shots.push({ t: Math.round(t * 1000) / 1000, x: Math.max(-SLING_SPAN - 0.1, Math.min(SLING_SPAN + 0.1, aim.x)), d: Math.max(0, Math.min(SLING_MAX_DEPTH, aim.d)) });
    playSfx("thunk");
  };

  // --- input: drag back on the sling (or click straight at a spot) -------------------------------
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    game.current.drag = { x0: x, y0: y, x, y };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g.drag) return;
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    g.drag.x = e.clientX - r.left;
    g.drag.y = e.clientY - r.top;
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    const drag = g.drag;
    g.drag = null;
    if (!drag) return;
    const c = canvasRef.current;
    if (!c) return;
    const { toRange } = geom(c.clientWidth, c.clientHeight);
    const moved = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (moved < 10) shoot(toRange(drag.x, drag.y));
    else if (g.aim) shoot(g.aim);
    void e;
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
      // the woods behind: a dusky sky, far pines along the horizon (just behind the far rail), the
      // grass sloping away from the sling
      const horizon = yOf(SLING_RAILS[SLING_RAILS.length - 1].depth) - 10;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#1d2a40");
      sky.addColorStop(1, "#4f6a5a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = "#1c2e22";
      for (let i = 0; i < 20; i++) {
        const px = (i / 19) * w;
        const ph = h * (0.1 + ((i * 37) % 11) / 110);
        ctx.beginPath();
        ctx.moveTo(px - 26, horizon + 2);
        ctx.lineTo(px, horizon - ph);
        ctx.lineTo(px + 26, horizon + 2);
        ctx.fill();
      }
      const grass = ctx.createLinearGradient(0, horizon, 0, h);
      grass.addColorStop(0, "#2f4a2c");
      grass.addColorStop(1, "#46663c");
      ctx.fillStyle = grass;
      ctx.fillRect(0, horizon, w, h - horizon);
      // the hay bales: the backstop, just behind the far rail
      for (let i = 0; i < 7; i++) {
        const bx = w * (0.06 + i * 0.128);
        ctx.fillStyle = "#b9964a";
        ctx.fillRect(bx, horizon - 4, w * 0.115, 16);
        ctx.fillStyle = "#8a6d34";
        ctx.fillRect(bx + w * 0.03, horizon - 4, 2, 16);
        ctx.fillRect(bx + w * 0.085, horizon - 4, 2, 16);
      }
      const range = g.range ?? slingRange(1);
      const run = playing ? playSlingshot(g.seed, g.shots.filter((s) => s.t + slingFlight(s.d) <= t)) : null;
      const downUntil = new Map<string, number>();
      if (run) for (const hit of run.hits) if (hit.rail >= 0) downUntil.set(`${hit.rail}:${hit.target}`, hit.at + SLING_DOWN_S);
      // the rails, far to near, and their targets
      for (let ri = SLING_RAILS.length - 1; ri >= 0; ri--) {
        const R = SLING_RAILS[ri];
        const y = yOf(R.depth);
        const s = scaleOf(R.depth);
        ctx.strokeStyle = "#2a2622";
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(xOf(-SLING_SPAN, R.depth), y);
        ctx.lineTo(xOf(SLING_SPAN, R.depth), y);
        ctx.stroke();
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
      // the stones in flight: an arc from the pouch to where they land
      for (const shot of g.shots) {
        const u = (t - shot.t) / slingFlight(shot.d);
        if (u < 0 || u > 1) continue;
        const tx = xOf(shot.x, shot.d);
        const ty = yOf(shot.d);
        const px = pouch.x + (tx - pouch.x) * u;
        const py = pouch.y + (ty - pouch.y) * u - Math.sin(u * Math.PI) * h * 0.18;
        ctx.fillStyle = "#8a8580";
        ctx.beginPath();
        ctx.arc(px, py, 6 * (1 - u * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      // the new hits: a score pop where each struck
      if (run && run.hits.length > g.announced) {
        for (const hit of run.hits.slice(g.announced)) {
          const d = hit.rail < 0 ? SLING_ACORN.depth : SLING_RAILS[hit.rail].depth;
          g.popups.push({ x: xOf(hit.x, d), y: yOf(d) - 20, text: hit.rail < 0 ? `🌰 +${hit.points} · +${GOLDEN_ACORN_COINS}🪙` : `+${hit.points}${hit.mult > 1 ? ` x${hit.mult}` : ""}`, at: performance.now(), gold: hit.rail < 0 || hit.mult >= 3 });
          playSfx(hit.rail < 0 ? "golden" : "clack");
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
      // the slingshot, and while pulling: the band, the stone and the dots of its flight
      g.aim = null;
      if (g.drag && playing) {
        const dx = g.drag.x - g.drag.x0;
        const dy = g.drag.y - g.drag.y0;
        const pull = Math.min(1, Math.hypot(dx, dy) / PULL_PX);
        if (pull > 0.05) {
          const aim = { x: Math.max(-SLING_SPAN, Math.min(SLING_SPAN, (-dx / PULL_PX) * SLING_SPAN * 1.1)), d: Math.max(0, Math.min(SLING_MAX_DEPTH, (dy / PULL_PX) * SLING_MAX_DEPTH)) };
          g.aim = aim;
          const tx = xOf(aim.x, aim.d);
          const ty = yOf(aim.d);
          ctx.fillStyle = "rgba(247, 235, 225, 0.85)";
          for (let k = 1; k <= 12; k++) {
            const u = k / 12;
            const px = pouch.x + (tx - pouch.x) * u;
            const py = pouch.y + (ty - pouch.y) * u - Math.sin(u * Math.PI) * h * 0.18;
            ctx.beginPath();
            ctx.arc(px, py, 3.2 - u * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = "#F5A623";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tx, ty, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      drawSling(ctx, pouch.x, pouch.y, g.drag && playing ? { x: Math.max(-60, Math.min(60, (g.drag.x - g.drag.x0) * 0.4)), y: Math.min(50, Math.max(0, (g.drag.y - g.drag.y0) * 0.3)) } : { x: 0, y: 0 });
      // the HUD's numbers (a React update a few times a second, not every frame)
      if (playing) {
        const time = Math.max(0, SLING_ROUND_S - t);
        const shotsLeft = SLING_SHOTS - g.shots.length;
        const all = playSlingshot(g.seed, g.shots.filter((s) => s.t + slingFlight(s.d) <= t));
        let streak = 0;
        for (let i = g.shots.length - 1; i >= 0; i--) {
          const landed = g.shots[i].t + slingFlight(g.shots[i].d) <= t;
          if (!landed) continue;
          if (all.hits.some((hh) => hh.shot === i)) streak++;
          else break;
        }
        setHud((prev) => {
          const next = { time: Math.ceil(time), shots: shotsLeft, score: all.score, mult: slingMult(streak), acorns: all.acorns };
          return prev.time === next.time && prev.shots === next.shots && prev.score === next.score && prev.mult === next.mult && prev.acorns === next.acorns ? prev : next;
        });
        // the round's end: the clock, or the last stone landed
        const lastLanded = g.shots.length >= SLING_SHOTS && g.shots.every((s) => s.t + slingFlight(s.d) <= t);
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
    <Modal title="Whispering Pines Slingshot Gallery" icon="🎯" onClose={close} landscape width={1100}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        {/* the round's numbers */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="cozy-pill rounded-full px-3 py-1 font-bold tabular-nums">⏱ {hud.time}s</span>
          <span className="cozy-pill flex items-center gap-0.5 rounded-full px-3 py-1" aria-label={`${hud.shots} stones left`}>
            {Array.from({ length: SLING_SHOTS }, (_, i) => (
              <span key={i} className={`inline-block h-2.5 w-2.5 rounded-full ${i < hud.shots ? "bg-[#C9BDB5]" : "bg-white/10"}`} />
            ))}
          </span>
          <span className="cozy-pill rounded-full px-3 py-1 font-extrabold tabular-nums text-[#F7EBE1]">⭐ {hud.score.toLocaleString("en-US")}</span>
          <span className={`rounded-full px-3 py-1 font-extrabold ${hud.mult > 1 ? "bg-[#F5A623] text-[#2B201B]" : "cozy-pill"}`}>Combo x{hud.mult}</span>
          {hud.acorns > 0 && <span className="cozy-pill rounded-full px-3 py-1 font-bold text-[#F5A623]">🌰 ×{hud.acorns}</span>}
          <span className="ml-auto text-xs opacity-75">{paid ? `Playing for coins · ${left} paid rounds left this hour` : "Just for fun this round (the hour's paid rounds are used up)"}</span>
        </div>
        {/* the range */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#4A3A30]">
          <canvas ref={canvasRef} className="h-full w-full" style={{ touchAction: "none", cursor: phase === "playing" ? "crosshair" : "default" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (game.current.drag = null)} aria-label="The slingshot range: drag back to aim, let go to shoot" />
          {phase !== "playing" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1C1614]/70 p-4 backdrop-blur-[2px]">
              {phase === "done" && result ? (
                <div className="cozy-card clay-pop flex w-full max-w-[420px] flex-col items-center gap-1.5 rounded-[20px] px-5 py-4 text-center">
                  <span className="text-4xl">{result.eagle ? "🦅" : result.hits >= 10 ? "🎯" : "🪨"}</span>
                  <b className="text-2xl text-[#F7EBE1]">{result.ok ? `${result.score.toLocaleString("en-US")} points` : "That round didn't count"}</b>
                  {result.ok && (
                    <span className="text-sm opacity-85">
                      {result.hits} hits · best run {result.streak} · {result.acorns} Golden Acorn{result.acorns === 1 ? "" : "s"} · personal best {result.best.toLocaleString("en-US")}
                    </span>
                  )}
                  {result.ok && result.paid && <span className="text-base font-bold text-[#F5A623]">{result.coins > 0 ? `+${result.coins} 🪙` : tier ? "No coins left in today's gallery purse" : `Score ${SLINGSHOT_PRIZES[SLINGSHOT_PRIZES.length - 1].score}+ for a prize`}</span>}
                  {result.capped && <span className="text-xs opacity-70">(today's gallery coins are nearly all won)</span>}
                  {result.eagle && <span className="text-sm font-bold text-[#8fd3b6]">🦅 Eagle Eye for 10 minutes: a wider green on the chopping meter and the reel</span>}
                  <button type="button" className="clay-btn clay-btn-amber mt-2 min-h-11 px-6" onClick={start}>
                    🎯 Another round
                  </button>
                </div>
              ) : phase === "scoring" ? (
                <b className="text-lg text-[#F7EBE1]">Counting the targets…</b>
              ) : (
                <div className="cozy-card flex w-full max-w-[460px] flex-col gap-2 rounded-[20px] px-5 py-4 text-center">
                  <b className="text-xl text-[#F7EBE1]">Step up to the rail!</b>
                  <p className="m-0 text-sm opacity-85">45 seconds, {SLING_SHOTS} stones. Drag back on the sling to aim (the dots show the stone's flight), let go to shoot. Or just click a target.</p>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🥫 Cans +50</span>
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🦆 Ducks +150</span>
                    <span className="rounded-xl bg-white/10 px-2 py-1.5">🦉 Owls +200</span>
                  </div>
                  <p className="m-0 text-xs opacity-75">
                    Hits in a row build a combo up to x4. The 🌰 Golden Acorn pays {GOLDEN_ACORN_COINS} 🪙 on the spot. Prizes: {SLINGSHOT_PRIZES.map((p) => `${p.score.toLocaleString("en-US")}+ → ${p.coins} 🪙${p.eagle ? " & 🦅 Eagle Eye" : ""}`).reverse().join(" · ")}
                  </p>
                  <button type="button" className="clay-btn clay-btn-amber min-h-11" disabled={phase === "starting"} onClick={start}>
                    {phase === "starting" ? "Loading the pouch…" : "🎯 Start the round"}
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
  // the stick it rides on
  ctx.fillStyle = "#4a3222";
  ctx.fillRect(-1.5, -2, 3, 8);
  if (down) {
    // knocked flat: just its edge on the rail
    ctx.fillStyle = "rgba(20, 16, 14, 0.6)";
    ctx.fillRect(-r, -4, r * 2, 4);
    ctx.restore();
    return;
  }
  if (kind === "can") {
    ctx.fillStyle = "#c9cdd2";
    ctx.fillRect(-r * 0.7, -r * 2.2, r * 1.4, r * 2.2);
    ctx.fillStyle = "#c2463a";
    ctx.fillRect(-r * 0.72, -r * 1.5, r * 1.44, r * 0.8);
    ctx.fillStyle = "#e9ecef";
    ctx.beginPath();
    ctx.ellipse(0, -r * 2.2, r * 0.7, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "duck") {
    ctx.fillStyle = "#f4d35e";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.8, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
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

function drawSling(ctx: CanvasRenderingContext2D, x: number, y: number, pull: { x: number; y: number }) {
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
  // the band, and the stone in its pouch
  ctx.strokeStyle = "#c2463a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-26, -34);
  ctx.lineTo(pull.x, -26 + pull.y);
  ctx.lineTo(26, -34);
  ctx.stroke();
  ctx.fillStyle = "#8a8580";
  ctx.beginPath();
  ctx.arc(pull.x, -26 + pull.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
