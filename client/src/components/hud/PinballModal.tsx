import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { PINBALL_TIERS, TABLE_LIMITS, pinballTier, type CasinoNotice, type CasinoPacket, type PinballResult, type PinballStarted } from "@shared/casino";
import {
  BALLS,
  BALL_R,
  PINBALL_STEP_S,
  PIN_LAUNCH,
  PIN_LEFT_DOWN,
  PIN_LEFT_UP,
  PIN_RIGHT_DOWN,
  PIN_RIGHT_UP,
  PLUNGER_DRAW,
  PLUNGER_Y,
  TABLE_H,
  TABLE_W,
  applyPinballInput,
  flipperTip,
  newPinballGame,
  stepPinball,
  type PinballGame,
} from "@shared/pinball";
import { playSfx } from "../../audio/sfx";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { Modal } from "./Modal";
import { VelvetChipIcon } from "./VelvetChipIcon";

// Velvet Nights, the pinball cabinets at the end of Neon Alley's slot row: a compact arcade cabinet
// (the playfield on the left, the stake, the score, the payout tiers and the plunger on the right),
// played for chips. Pick a stake (10 to 100 Velvet Chips: three balls a credit), pull the plunger:
// the credit goes in with the first ball; when the third drains the server plays the game again
// from its inputs (shared/pinball.ts: the same table, stepped the same way) and pays its score by
// tier. Closing the panel mid-game ends it there, paid on the score so far.
//
// Controls: ← / A and → / D (or either Shift) for the flippers, ↓ / S / Space held and let go for the
// plunger. On a touch screen: the left half of the playfield is the left flipper, the right half the
// right one, and the plunger is the slider on the right (pull it down and let go).

interface Props {
  propId: string;
  chips: number;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  send: (packet: CasinoPacket) => void;
  onClose: () => void;
}

type Phase = "insert" | "playing" | "settling" | "result";

const BEST_KEY = "cozy-pinball-best";
const LIMITS = TABLE_LIMITS.pinball;
/** The most steps a frame may run (a tab that slept does not replay its whole nap at once). */
const MAX_STEPS_PER_FRAME = 40;

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function PinballModal({ propId, chips, subscribeMessages, send, onClose }: Props) {
  const [stake, setStake] = useState<number>(LIMITS.presets[0]);
  const [phase, setPhase] = useState<Phase>("insert");
  const [score, setScore] = useState(0);
  const [ball, setBall] = useState(1);
  const [mult, setMult] = useState(1);
  const [ready, setReady] = useState(true);
  const [best, setBest] = useState(readBest);
  const [plungerUi, setPlungerUi] = useState(0);
  const [result, setResult] = useState<PinballResult | null>(null);
  const [note, setNote] = useState("");
  const [burst, setBurst] = useState(0);

  const game = useRef<PinballGame>(newPinballGame());
  /** The credit in play: its stake, the server's game id once it answers, the inputs so far. */
  const credit = useRef<{ stake: number; gameId: number | null; inputs: number[]; ended: boolean } | null>(null);
  const plunger = useRef({ value: 0, pulling: false });
  const phaseRef = useRef<Phase>("insert");
  const canvas = useRef<HTMLCanvasElement>(null);
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /** An input, applied to the table and, in a paid game, logged for the server's replay. */
  const input = (code: number) => {
    const g = game.current;
    if (credit.current && phaseRef.current === "playing") credit.current.inputs.push(g.steps, code);
    applyPinballInput(g, code);
  };

  /** The game's end, told to the server once it knows the game (its inputs and how far it ran). */
  const sendEnd = () => {
    const c = credit.current;
    if (!c || c.ended || c.gameId === null) return;
    c.ended = true;
    send({ type: "PINBALL_END", propId, gameId: c.gameId, steps: game.current.steps, inputs: c.inputs });
  };

  const flip = (side: -1 | 1, on: boolean) => input(side < 0 ? (on ? PIN_LEFT_UP : PIN_LEFT_DOWN) : on ? PIN_RIGHT_UP : PIN_RIGHT_DOWN);

  /** The plunger let go: the first ball of a new credit (the stake goes in), or the next ball. */
  const release = () => {
    const strength = Math.round(plunger.current.value * 1000);
    plunger.current = { value: 0, pulling: false };
    setPlungerUi(0);
    if (strength < 50) return;
    const ph = phaseRef.current;
    if (ph === "insert" || ph === "result") {
      if (chips < stake) {
        setNote(`A credit is ${stake} chips: you have ${chips}. Mr. Vance changes coins at the Golden Cage.`);
        return;
      }
      game.current = newPinballGame();
      credit.current = { stake, gameId: null, inputs: [], ended: false };
      setResult(null);
      setNote("");
      setScore(0);
      setBall(1);
      setMult(1);
      setPhaseBoth("playing");
      input(PIN_LAUNCH + strength);
      send({ type: "PINBALL_START", propId, stake });
      return;
    }
    if (ph === "playing") input(PIN_LAUNCH + strength);
  };

  // the server's answers: the credit taken (or refused), and the game's result
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "pinballStarted") {
          const m = payload as PinballStarted;
          const c = credit.current;
          if (m.propId !== propId || !c || c.gameId !== null) return;
          c.gameId = m.gameId;
          if (game.current.over) sendEnd();
        } else if (type === "pinballResult") {
          const r = payload as PinballResult;
          if (r.propId !== propId || credit.current?.gameId !== r.gameId) return;
          if (r.score !== game.current.score) console.warn("[pinball] the server's replay scored", r.score, "against", game.current.score);
          credit.current = null;
          setResult(r);
          setScore(r.score);
          setPhaseBoth("result");
          if (r.payout > 0) {
            playSfx(r.mult >= 5 ? "jackpot" : "coins");
            playSfx("chime", 0.8);
            setBurst((n) => n + 1);
          }
        } else if (type === "casinoNotice") {
          // a credit refused before it went in: the game never counted
          const c = credit.current;
          if (!c || c.gameId !== null || phaseRef.current !== "playing") return;
          const reason = (payload as CasinoNotice).reason;
          credit.current = null;
          game.current = newPinballGame();
          setPhaseBoth("insert");
          setNote(reason === "chips" ? "Not enough chips for that credit." : reason === "occupied" ? "Someone else is at this cabinet." : "The cabinet didn't take the credit.");
        }
      }),
    [subscribeMessages, propId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // closing mid-game ends it there (paid on the score so far)
  useEffect(() => () => sendEnd(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // the keys
  useEffect(() => {
    const L = new Set(["ArrowLeft", "KeyA", "ShiftLeft"]);
    const R = new Set(["ArrowRight", "KeyD", "ShiftRight"]);
    const P = new Set(["ArrowDown", "KeyS", "Space"]);
    const down = (e: KeyboardEvent) => {
      if (!L.has(e.code) && !R.has(e.code) && !P.has(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (L.has(e.code)) flip(-1, true);
      else if (R.has(e.code)) flip(1, true);
      else plunger.current.pulling = true;
    };
    const up = (e: KeyboardEvent) => {
      if (L.has(e.code)) flip(-1, false);
      else if (R.has(e.code)) flip(1, false);
      else if (P.has(e.code) && plunger.current.pulling) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // the machine, every frame: its fixed steps, its sounds, the scoreboard, and the playfield drawn
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const shown = { score: 0, ball: 1, mult: 1, ready: true, plunger: 0, over: false };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const g = game.current;
      acc += dt;
      let n = 0;
      while (acc >= PINBALL_STEP_S && n < MAX_STEPS_PER_FRAME) {
        stepPinball(g);
        acc -= PINBALL_STEP_S;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME) acc = 0;
      for (const [kind, vol] of g.sounds.splice(0)) playSfx(kind, vol);
      if (plunger.current.pulling) plunger.current.value = Math.min(1, plunger.current.value + dt * 1.2);
      const pl = plunger.current.value;
      if (pl !== shown.plunger) setPlungerUi((shown.plunger = pl));
      const playing = phaseRef.current === "playing";
      if (playing && g.score !== shown.score) setScore((shown.score = g.score));
      if (g.ball !== shown.ball) setBall((shown.ball = g.ball));
      if (g.mult !== shown.mult) setMult((shown.mult = g.mult));
      if (g.resting !== shown.ready) setReady((shown.ready = g.resting));
      if (playing && g.over && !shown.over) {
        shown.over = true;
        setPhaseBoth("settling");
        setBest((b) => {
          const nb = Math.max(b, g.score);
          try {
            localStorage.setItem(BEST_KEY, String(nb));
          } catch {
            // storage blocked: the best holds for this visit
          }
          return nb;
        });
        sendEnd();
      }
      if (!g.over) shown.over = false;

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
      // the plunger's rod, and the ball on it drawn back as it is pulled (the table itself never
      // moves it: the pull is the panel's until it is let go)
      const drawn = g.resting ? pl * PLUNGER_DRAW : 0;
      ctx.fillStyle = "#b9c0c7";
      ctx.fillRect(X(0.9), Y(PLUNGER_Y + BALL_R + pl * PLUNGER_DRAW), s * 0.04, s * 0.06);
      const bx = g.pos.x;
      const by = g.pos.y + drawn;
      const grad = ctx.createRadialGradient(X(bx - 0.008), Y(by - 0.008), 1, X(bx), Y(by), BALL_R * s);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#cfd6de");
      grad.addColorStop(1, "#5f6770");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(X(bx), Y(by), BALL_R * s, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // touch (and mouse): the left half of the playfield works the left flipper, the right half the right
  const zones = useRef(new Map<number, -1 | 1>());
  const onZoneDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const side: -1 | 1 = e.clientX < r.left + r.width / 2 ? -1 : 1;
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
  const drag = useRef<{ y0: number; id: number } | null>(null);
  const onPlungerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, id: e.pointerId };
  };
  const onPlungerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    plunger.current.value = Math.max(0, Math.min(1, (e.clientY - d.y0) / 90));
  };
  const onPlungerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    release();
  };

  const tierNow = pinballTier(score);
  const busy = phase === "playing" || phase === "settling";
  const message =
    phase === "insert"
      ? `Pick a stake, then pull the plunger: ${BALLS} balls a credit`
      : phase === "settling"
        ? "Totting up the score..."
        : phase === "result" && result
          ? result.payout > 0
            ? `${pinballTier(result.score)?.label ?? ""}! +${result.payout.toLocaleString("en-US")} chips`
            : "No win this time: pull for another credit"
          : ready && ball <= BALLS
            ? `Ball ${ball}: pull the plunger`
            : "";

  return (
    <Modal landscape width={720} title="Velvet Nights" icon="🕹️" onClose={onClose} tone="velvet" placard={`${LIMITS.min}-${LIMITS.max} CHIPS · ${BALLS} BALLS A CREDIT`}>
      <div className="flex min-h-0 flex-1 gap-3">
        {/* the playfield (65%): the flipper zones over the whole of it, left half and right half */}
        <div className="relative flex min-h-0 basis-[65%] touch-none select-none items-center justify-center" onPointerDown={onZoneDown} onPointerUp={onZoneUp} onPointerCancel={onZoneUp}>
          <div className="relative aspect-[1/1.8] h-full max-w-full rounded-2xl border-4 border-amber-300/70 shadow-[inset_0_0_30px_rgba(0,0,0,0.7),0_10px_30px_rgba(0,0,0,0.5)]">
            <canvas ref={canvas} className="absolute inset-0 h-full w-full rounded-xl" aria-label="The pinball playfield" />
            {message && <div className="pointer-events-none absolute inset-x-2 top-[40%] rounded-xl bg-black/65 px-3 py-2 text-center text-[13px] font-bold leading-snug text-amber-100">{message}</div>}
            <Burst key={burst} active={burst > 0} big={(result?.mult ?? 0) >= 5} />
          </div>
          <span className="touch-hint pointer-events-none absolute bottom-1 left-1 text-[10px] font-bold uppercase tracking-widest text-amber-200/50">◀ flip</span>
          <span className="touch-hint pointer-events-none absolute bottom-1 right-1 text-[10px] font-bold uppercase tracking-widest text-amber-200/50">flip ▶</span>
        </div>

        {/* the controls (35%): stake, score, tiers, plunger */}
        <div className="flex min-h-0 basis-[35%] flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Stake">
            {LIMITS.presets.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stake === n}
                disabled={busy}
                onClick={() => setStake(n)}
                className={`flex min-h-12 items-center justify-center gap-1 rounded-full border text-sm font-extrabold transition ${stake === n ? "border-amber-200 bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950 shadow-[0_3px_10px_rgba(244,161,92,0.45)]" : "border-amber-300/30 bg-black/40 text-amber-100"} disabled:opacity-50`}
              >
                <VelvetChipIcon size="1.05em" /> {n}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-1 text-[11px] text-amber-100/70">
            <span>
              Yours: <VelvetChipIcon size="0.95em" /> {chips.toLocaleString("en-US")}
            </span>
            <span>Best {best.toLocaleString("en-US")}</span>
          </div>
          <div className="rounded-2xl border border-amber-300/40 bg-black/50 px-3 py-1.5 text-center">
            <div className="casino-numeral text-2xl leading-tight text-amber-100">{score.toLocaleString("en-US")}</div>
            <div className="flex justify-between text-[11px] opacity-80">
              <span>
                Ball {Math.min(ball, BALLS)}/{BALLS}
              </span>
              <span>Lanes ×{mult}</span>
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[11px]" aria-label="Payout tiers">
            {PINBALL_TIERS.map((t) => (
              <li key={t.score} className={`flex justify-between rounded-lg px-2 py-0.5 ${tierNow === t ? "bg-amber-300/25 font-bold text-amber-100" : "text-amber-100/60"}`}>
                <span>{t.score.toLocaleString("en-US")}+</span>
                <span>
                  ×{t.mult} {t.label}
                </span>
              </li>
            ))}
          </ul>
          {note && <p className="m-0 text-[11px] leading-snug text-rose-200">{note}</p>}
          {/* the plunger: pull it down, let go */}
          <div className="flex min-h-0 flex-1 items-end justify-center gap-2 pb-1">
            <div
              className={`relative h-full max-h-36 min-h-24 w-14 touch-none select-none rounded-full border-2 bg-black/50 ${ready && phase !== "settling" ? "border-amber-300/80" : "border-amber-300/30"}`}
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
              <span className="absolute left-1/2 h-12 w-12 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#c8ced6_45%,#6b737c)] shadow-lg" style={{ top: `calc(4px + ${plungerUi} * (100% - 56px))` }} />
              <span className="absolute bottom-1.5 left-0 right-0 text-center text-[9px] font-bold uppercase tracking-wider text-amber-200/70">Pull</span>
            </div>
            <span className="kbd-hint self-center text-[10px] leading-tight opacity-60">
              ← → flip
              <br />
              hold ↓ launch
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Chips and sparkles bursting from the playfield's middle when a game pays. */
function Burst({ active, big }: { active: boolean; big: boolean }) {
  if (!active) return null;
  const n = big ? 42 : 22;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
      <style>{BURST_CSS}</style>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
        const d = 60 + ((i * 37) % 90);
        const style = { "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d - 40}px`, animationDelay: `${(i % 5) * 40}ms` } as CSSProperties;
        return (
          <span key={i} className="pb-burst" style={style}>
            {i % 3 === 0 ? "✨" : <VelvetChipIcon size="14px" />}
          </span>
        );
      })}
    </div>
  );
}

const BURST_CSS = `
.pb-burst { position: absolute; left: 50%; top: 45%; font-size: 14px; animation: pb-burst 1.4s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes pb-burst {
  0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 60px)) scale(1.1) rotate(200deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .pb-burst { animation-duration: 1ms; } }
`;
