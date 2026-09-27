import { useEffect, useRef, useState } from "react";
import { POOL_H, POOL_HEAD, POOL_POCKET, POOL_POCKETS, POOL_R, POOL_RAIL, POOL_W, PoolSim, poolCueSpotFree, poolGroupOf, poolRack, type PoolBall, type PoolGroup, type PoolMatch, type PoolShotEvent } from "@shared/pool";
import type { CasinoPacket } from "@shared/casino";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The Velvet Lounge's 8-ball table, from above, for the love of the game (no chips). The physics
// are shared (shared/pool.ts PoolSim: fixed 1/120 s steps, the same on every screen), so:
//
//   Solo       a rack of your own: pot a ball to take its group (solids or stripes), clear it and
//              sink the 8. The 8 early loses the rack; a scratch puts the cue ball back on the spot.
//   Match      two players at the table (the room's match: "poolState"): turns, the break, groups
//              set by the first ball legally potted, fouls (a scratch, no ball hit, the wrong ball
//              first) handing the other player ball in hand (place the cue ball anywhere, then
//              shoot). Every shot is sent to the room and replayed on every screen from the same
//              table ("poolShot"); the shooter's screen reports where the balls stopped and the room
//              rules on it.
//
// Aim: point behind the cue ball (the cue lies on the pointer's side, the dotted line shows where
// the ball goes), press and pull back, let go: the further the pull, the harder the shot.
//
// Walking up asks which it's to be (Solo Practice or a 2-Player Match); the table is drawn 2:1 in
// its walnut frame, fitted to the panel whole (every pocket, cushion and the cue in view), the power
// meter under it: nothing to scroll.

interface Props {
  match: PoolMatch | null;
  localSessionId: string;
  send: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

type Mode = "solo" | "match";
/** The canvas: the table (POOL_W by POOL_H) in a walnut frame that makes it 2:1. */
const FRAME_X = (POOL_H * 2 - POOL_W) / 2;
const CANVAS_W = POOL_W + FRAME_X * 2;

/** The largest box of `ratio` (width / height) that fits the element. */
function useFit(ratio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const fw = Math.min(w, h * ratio);
      setSize({ w: Math.floor(fw), h: Math.floor(fw / ratio) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return { ref, size };
}
const BEST_KEY = "cozy-pool-best";
const COLORS = ["#f4f1ea", "#f2c230", "#2f5fd0", "#d8322b", "#6a3aa8", "#f07c1c", "#1f8a4c", "#7a1f2e", "#141414"];
const colorOf = (n: number) => COLORS[n === 0 ? 0 : n === 8 ? 8 : ((n - 1) % 8) + 1];
const leftOf = (balls: PoolBall[], g: PoolGroup | null) => (g ? balls.filter((b) => !b.in && poolGroupOf(b.n) === g).length : 7);

export function PoolModal({ match, localSessionId, send, subscribeMessages, onClose }: Props) {
  const inMatch = !!match && match.players.some((p) => p.sessionId === localSessionId);
  // walking up asks which it's to be (unless you're already in the room's match)
  const [mode, setModeRaw] = useState<Mode>(inMatch ? "match" : "solo");
  const [choosing, setChoosing] = useState(!inMatch);
  const setMode = (m: Mode) => {
    setModeRaw(m);
    setChoosing(false);
  };
  const choose = (m: Mode) => {
    setMode(m);
    // a match: take the open place at the table if there is one
    const cur = matchRef.current;
    if (m === "match" && cur && cur.phase !== "playing" && !cur.players.some((p) => p.sessionId === localSessionId) && cur.players.length < 2) send({ type: "POOL_JOIN" });
  };
  const fit = useFit(CANVAS_W / POOL_H);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const matchRef = useRef(match);
  matchRef.current = match;

  const canvas = useRef<HTMLCanvasElement>(null);
  // what is drawn: the table at rest, or the shot being played out
  const table = useRef<PoolBall[]>(poolRack());
  const sim = useRef<{ sim: PoolSim; shotId: number; by: string } | null>(null);
  const aim = useRef<{ x: number; y: number; power: number } | null>(null);
  const [power, setPower] = useState(0);

  // --- solo ---
  const [soloGroup, setSoloGroup] = useState<PoolGroup | null>(null);
  const soloGroupRef = useRef(soloGroup);
  soloGroupRef.current = soloGroup;
  const [shots, setShots] = useState(0);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const broke = useRef(false);
  const [say, setSay] = useState("Point behind the cue ball, press, pull back and let go to break");
  const [best, setBest] = useState<number | null>(() => {
    try {
      const v = Number(window.localStorage.getItem(BEST_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const soloRack = (text: string) => {
    table.current = poolRack();
    sim.current = null;
    broke.current = false;
    setSoloGroup(null);
    setShots(0);
    setSay(text);
  };

  // --- the match: ball in hand places the cue ball first ---
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const myTurn = !!match && match.phase === "playing" && !match.pending && match.players[match.turn]?.sessionId === localSessionId;
  const myTurnRef = useRef(myTurn);
  myTurnRef.current = myTurn;
  const handRef = useRef(false);
  handRef.current = myTurn && !!match?.ballInHand;

  // switching modes: each has its own table
  useEffect(() => {
    sim.current = null;
    aim.current = null;
    setPlacing(null);
    if (mode === "solo") soloRack("Point behind the cue ball, press, pull back and let go to break");
    else if (match) table.current = match.balls.map((b) => ({ ...b }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // the room's word on the match: the table at rest, as ruled
  useEffect(() => {
    if (!match || mode !== "match") return;
    if (!sim.current) table.current = match.balls.map((b) => ({ ...b }));
    if (!match.ballInHand) setPlacing(null);
  }, [match, mode]);
  // walking away from the table (the panel closing) leaves the match: the other player isn't kept waiting
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () => () => {
      const m = matchRef.current;
      if (m && m.phase !== "over" && m.players.some((p) => p.sessionId === localSessionId)) sendRef.current({ type: "POOL_LEAVE" });
    },
    [localSessionId]
  );
  // a match's shot, replayed here from the table as it stood
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "poolShot" || modeRef.current !== "match") return;
        const ev = payload as PoolShotEvent;
        const m = matchRef.current;
        const s = new PoolSim(m ? m.balls : table.current);
        s.shoot(ev.angle, ev.power, ev.cue);
        sim.current = { sim: s, shotId: ev.shotId, by: ev.by };
        playSfx("clack", 0.4 + ev.power * 0.6);
      }),
    [subscribeMessages]
  );

  // --- a shot's end ---
  const finish = (done: { sim: PoolSim; shotId: number; by: string }) => {
    const after = done.sim.snapshot();
    if (modeRef.current === "match") {
      // the room still waiting on this shot: the balls as they came to rest (the ruling brings the
      // same table back); the room already moved on (the shot timed out): its table
      const m = matchRef.current;
      const waiting = !!m && m.pending && m.shotId === done.shotId;
      table.current = waiting || !m ? after : m.balls.map((b) => ({ ...b }));
      if (waiting && done.by === localSessionId) send({ type: "POOL_SETTLE", shotId: done.shotId, balls: after, potted: done.sim.potted, firstHit: done.sim.firstHit });
      return;
    }
    // solo: its own rules
    const potted = done.sim.potted;
    const cue = after[0];
    const scratch = cue.in;
    if (scratch) {
      Object.assign(cue, { x: POOL_HEAD.x, y: POOL_HEAD.y, in: false });
      while (!poolCueSpotFree(after, cue.x, cue.y) && cue.y < POOL_H - POOL_RAIL - POOL_R) cue.y += POOL_R * 2.2;
    }
    table.current = after;
    let g = soloGroupRef.current;
    const first = potted.map(poolGroupOf).find((x) => x);
    if (!g && first) {
      g = first;
      setSoloGroup(g);
    }
    const mineLeft = leftOf(after, g);
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
        window.setTimeout(() => modeRef.current === "solo" && soloRack("A fresh rack: break when you're ready"), 2600);
      } else {
        setSay("The 8 went down early: that rack's lost. Racking up again…");
        window.setTimeout(() => modeRef.current === "solo" && soloRack("A fresh rack: break when you're ready"), 2200);
      }
      return;
    }
    if (scratch) setSay("Scratch! The cue ball goes back on the spot");
    else if (potted.length) setSay(`Down: ${potted.map((n) => `#${n}`).join(", ")}${g ? ` · ${mineLeft} of your ${g} left` : ""}`);
    else setSay(g ? `${mineLeft} of your ${g} left${mineLeft === 0 ? ": now the 8!" : ""}` : "Nothing down: pot a ball to pick your group");
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // --- the animation and the drawing, every frame ---
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = CANVAS_W * dpr;
    c.height = POOL_H * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastClack = 0;
    const frame = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      const run = sim.current;
      if (run) {
        while (acc >= 1 / 120 && run.sim.moving) {
          const { clacks, pots } = run.sim.step();
          acc -= 1 / 120;
          for (const rel of clacks) {
            if (now - lastClack > 45) {
              lastClack = now;
              playSfx("clack", Math.min(1, rel / 700));
            }
          }
          if (pots.length) playSfx("pocket", 0.8);
        }
        if (!run.sim.moving) {
          sim.current = null;
          finishRef.current(run);
        }
      } else acc = 0;
      ctx.save();
      frame2to1(ctx);
      ctx.translate(FRAME_X, 0);
      draw(ctx, sim.current ? sim.current.sim.snapshot() : table.current, sim.current ? null : aim.current, placingRef.current);
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- the pointer: place the cue ball (ball in hand), then drag back and let go ---
  const toTable = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS_W - FRAME_X, y: ((e.clientY - r.top) / r.height) * POOL_H };
  };
  const canShoot = () => !sim.current && (modeRef.current === "solo" || myTurnRef.current);
  const cueAt = () => placingRef.current ?? table.current[0];
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (!canShoot()) return;
    const p = toTable(e);
    // ball in hand: the first press puts the cue ball down (anywhere clear on the cloth)
    if (modeRef.current === "match" && handRef.current && !placingRef.current) {
      const others = table.current.filter((b) => b.n !== 0);
      if (poolCueSpotFree(others, p.x, p.y)) setPlacing(p);
      else playSfx("rattle", 0.4);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = p;
    aim.current = { ...p, power: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!canShoot()) return;
    const p = toTable(e);
    const pw = start.current ? Math.min(1, Math.hypot(p.x - start.current.x, p.y - start.current.y) / 180) : 0;
    aim.current = { x: p.x, y: p.y, power: pw };
    setPower(pw);
  };
  const onUp = () => {
    const a = aim.current;
    start.current = null;
    setPower(0);
    if (!a || !canShoot() || a.power < 0.04) return;
    const cue = cueAt();
    const angle = Math.atan2(cue.y - a.y, cue.x - a.x);
    aim.current = null;
    if (modeRef.current === "solo") {
      const s = new PoolSim(table.current);
      s.shoot(angle, a.power);
      sim.current = { sim: s, shotId: 0, by: localSessionId };
      playSfx("clack", 0.4 + a.power * 0.6);
      setShots((n) => n + 1);
      if (!broke.current) {
        broke.current = true;
        send({ type: "POOL_BREAK" });
      }
      return;
    }
    const m = matchRef.current;
    if (!m) return;
    send({ type: "POOL_SHOT", shotId: m.shotId, angle, power: a.power, cue: m.ballInHand ? placingRef.current : null });
    setPlacing(null);
  };

  const me = match?.players.find((p) => p.sessionId === localSessionId);
  const status =
    mode === "solo"
      ? say
      : !match
        ? "Finding the table…"
        : match.pending
          ? "The balls are rolling…"
          : myTurn && match.ballInHand && !placing
            ? "Ball in hand: click the cloth to place the cue ball"
            : match.say;

  return (
    <Modal landscape title="The 8-Ball Table" icon="🎱" onClose={onClose} tone="felt">
      <div className="casino-body relative flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => setChoosing(true)} className="rounded-full border border-amber-300/30 bg-black/30 px-3 py-1 font-extrabold text-amber-100 hover:bg-white/10">
            {mode === "solo" ? "🎯 Solo Practice" : "👥 2-Player Match"} ▾
          </button>
          {mode === "solo" ? (
            <>
              <span className="font-bold">
                {soloGroup ? (
                  <>
                    You're on <b className="text-amber-200">{soloGroup}</b> ({leftOf(table.current, soloGroup)} left)
                  </>
                ) : (
                  "Open table"
                )}
              </span>
              <span className="opacity-70">
                Shots: {shots}
                {best ? ` · best clear: ${best}` : ""}
              </span>
              <button type="button" onClick={() => soloRack("A fresh rack: break when you're ready")} className="clay-btn clay-btn-ghost min-h-8 px-3 text-xs">
                Re-rack
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(match?.players ?? []).map((p, i) => (
                  <span key={p.sessionId} className={`rounded-full px-2.5 py-1 font-bold ${match?.phase === "playing" && match.turn === i ? "bg-amber-300 text-amber-950" : "bg-white/10"}`}>
                    {p.username}
                    {p.group ? ` · ${p.group}` : ""}
                    {match?.phase === "playing" && match.turn === i ? " 🎯" : ""}
                  </span>
                ))}
                {match && match.players.length < 2 && <span className="rounded-full bg-white/5 px-2.5 py-1 opacity-60">waiting for a challenger</span>}
              </div>
              <div className="flex gap-1.5">
                {match?.phase === "waiting" && !me && match.players.length < 2 && (
                  <button type="button" onClick={() => send({ type: "POOL_JOIN" })} className="clay-btn clay-btn-amber min-h-8 px-4 text-xs">
                    Join the Table
                  </button>
                )}
                {match?.phase === "over" && (
                  <button type="button" onClick={() => send({ type: "POOL_JOIN" })} className="clay-btn clay-btn-amber min-h-8 px-4 text-xs">
                    New Match
                  </button>
                )}
                {me && match?.phase !== "over" && (
                  <button type="button" onClick={() => send({ type: "POOL_LEAVE" })} className="clay-btn clay-btn-ghost min-h-8 px-4 text-xs">
                    {match?.phase === "playing" ? "Concede" : "Leave"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div ref={fit.ref} className="flex min-h-0 flex-1 items-center justify-center">
          <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="touch-none rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.5)]" style={{ width: fit.size.w || undefined, height: fit.size.h || undefined, aspectRatio: `${CANVAS_W} / ${POOL_H}`, cursor: mode === "match" && !myTurn ? "default" : "crosshair" }} aria-label="The pool table: drag back to aim and shoot" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/80">Power</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500" style={{ width: `${power * 100}%` }} />
          </div>
        </div>
        <div className="min-h-[1.25rem] text-center text-sm font-bold text-amber-100" role="status">
          {status}
          {mode === "match" && <span className="ml-2 text-[11px] font-normal opacity-60">Fouls (a scratch, no ball hit, the wrong ball first) give ball in hand.</span>}
        </div>

        {choosing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/55 backdrop-blur-[2px]">
            <div className="flex w-[min(34rem,90%)] flex-col items-center gap-3 rounded-3xl border border-amber-300/40 bg-[#123524]/95 p-5 shadow-2xl">
              <div className="casino-title text-lg">
                <span className="gold-foil">How will you play?</span>
              </div>
              <div className="grid w-full grid-cols-2 gap-3">
                <button type="button" onClick={() => choose("solo")} className="clay-btn clay-btn-amber flex min-h-24 flex-col items-center justify-center gap-1 text-base">
                  <span className="text-3xl">🎯</span>
                  Solo Practice
                  <span className="text-[11px] font-normal opacity-80">a rack of your own</span>
                </button>
                <button type="button" onClick={() => choose("match")} className="clay-btn clay-btn-mint flex min-h-24 flex-col items-center justify-center gap-1 text-base">
                  <span className="text-3xl">👥</span>
                  2-Player Match
                  <span className="text-[11px] font-normal opacity-80">{match && match.players.length === 1 && !me ? `take on ${match.players[0].username}` : match?.phase === "playing" && !me ? "watch the match" : "wait for a challenger"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The walnut frame round the table, making the canvas 2:1. */
function frame2to1(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, POOL_H);
  g.addColorStop(0, "#3a1d0e");
  g.addColorStop(1, "#24110a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, POOL_H);
  ctx.fillStyle = "#c9a24a";
  for (const x of [FRAME_X / 2, CANVAS_W - FRAME_X / 2]) {
    ctx.beginPath();
    ctx.arc(x, POOL_H / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The table: the rails and their diamonds, the cloth, the pockets, the balls, and the cue with its
 *  aim line while you line up a shot. */
function draw(ctx: CanvasRenderingContext2D, balls: PoolBall[], aim: { x: number; y: number; power: number } | null, placing: { x: number; y: number } | null) {
  const W = POOL_W;
  const H = POOL_H;
  const R = POOL_R;
  ctx.fillStyle = "#5a2d14";
  ctx.fillRect(0, 0, W, H);
  const cloth = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  cloth.addColorStop(0, "#23894f");
  cloth.addColorStop(1, "#176a3b");
  ctx.fillStyle = cloth;
  ctx.fillRect(POOL_RAIL, POOL_RAIL, W - 2 * POOL_RAIL, H - 2 * POOL_RAIL);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(POOL_HEAD.x, POOL_RAIL);
  ctx.lineTo(POOL_HEAD.x, H - POOL_RAIL);
  ctx.stroke();
  ctx.fillStyle = "#d9b25a";
  for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
    ctx.beginPath();
    ctx.arc(POOL_RAIL + (W - 2 * POOL_RAIL) * t, POOL_RAIL / 2, 2.4, 0, Math.PI * 2);
    ctx.arc(POOL_RAIL + (W - 2 * POOL_RAIL) * t, H - POOL_RAIL / 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [px, py] of POOL_POCKETS) {
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.arc(px, py, POOL_POCKET, 0, Math.PI * 2);
    ctx.fill();
  }
  const shown = placing ? balls.map((b) => (b.n === 0 ? { ...b, x: placing.x, y: placing.y, in: false } : b)) : balls;
  for (const b of shown) {
    if (b.in) continue;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 2.5, R, 0, Math.PI * 2);
    ctx.fill();
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
  const cue = shown[0];
  if (aim && !cue.in) {
    const dx = cue.x - aim.x;
    const dy = cue.y - aim.y;
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
    const back = 16 + aim.power * 60;
    ctx.strokeStyle = "#c8934a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cue.x - ux * back, cue.y - uy * back);
    ctx.lineTo(cue.x - ux * (back + 230), cue.y - uy * (back + 230));
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}
