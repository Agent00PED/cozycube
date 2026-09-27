import { useEffect, useRef, useState } from "react";
import { PUSHER_MACHINES, TABLE_LIMITS, limitPlacard, pusherAccuracy, pusherBarPos, type PusherEvent, type PusherPurse, type PusherView } from "@shared/casino";
import { COIN_R, GUTTER_W, PEG_CHUTE, PEG_KNOCK, PEG_ROWS, PLATE_FRONT, platePos, unpackShelf } from "@shared/pusherSim";
import type { PusherId } from "@shared/worlds/casino";
import { playSfx } from "../../audio/sfx";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { Modal } from "./Modal";
import { BetPicker, ShortOfChips, clampStake } from "./BetControls";
import { ChipAmount } from "./VelvetChipIcon";

// A coin pusher in Neon Alley, played on a 2.5D cabinet drawn on a canvas: the brass dropper sweeps
// across the top of the peg board; press DROP (or Space) and your coin rattles down the pegs (the
// path the server rolled) onto the shelf, or down a side chute if it came down an outer lane. The
// shelf is the server's (shared/pusherSim.ts, sent about ten times a second: every coin on it, eased
// between updates); the motorised plate at its back slides in and out with the shelf's own clock,
// the coins shove one another, and what goes over the front edge drops into the win tray (yours,
// for a while after your coin) or, hugging the left rail, into the house's gutter. Two machines:
// the house's, and the gold-trimmed High-Roller Pusher.

interface Props {
  propId: PusherId;
  chips: number;
  coins: number;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onDrop: (stake: number, pos: number) => void;
  onClose: () => void;
}

type Coin = { id: number; x: number; y: number; v: number };
type Falling = { x: number; v: number; gutter: boolean; at: number; paid: boolean };
type Dropping = { path: number[]; landed: boolean; v: number; at: number; from: number };

const DROP_ROW_MS = 110;
/** A coin's colours by its value: the chip colours of the casino (white 2, red 5, green 25, black
 *  100, purple 250 and up). */
function coinTone(v: number): [string, string] {
  if (v >= 250) return ["#7b4fc4", "#3f2270"];
  if (v >= 100) return ["#2b2630", "#0e0c10"];
  if (v >= 25) return ["#2e8a57", "#15502f"];
  if (v >= 5) return ["#c8322b", "#761611"];
  return ["#f1ece0", "#b7ad98"];
}

export function CoinPusherModal({ propId, chips, coins, subscribeMessages, onDrop, onClose }: Props) {
  const machine = PUSHER_MACHINES[propId];
  const LIMIT = TABLE_LIMITS[machine.limit];
  const high = propId === "coin_pusher_high";
  const [stake, setStake] = useState<number>(LIMIT.presets[0]);
  const [purse, setPurse] = useState<PusherPurse | null>(null);
  const [lastPaid, setLastPaid] = useState<{ n: number; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shelfValue, setShelfValue] = useState(0);
  const tokens = purse?.tokens ?? [];
  const free = tokens.length > 0;
  const shown = purse?.chips ?? chips;
  const bet = clampStake(stake, LIMIT, shown);

  // the shelf as the server last told it, and the one before (eased between them)
  const shelf = useRef<{ prev: Map<number, Coin>; cur: Map<number, Coin>; at: number; t: number; tAt: number }>({ prev: new Map(), cur: new Map(), at: 0, t: 0, tAt: 0 });
  const falling = useRef<Falling[]>([]);
  const dropping = useRef<Dropping | null>(null);
  const t0 = useRef(performance.now());
  const aimPos = useRef(0.5);
  const aimText = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        const now = performance.now();
        if (type === "pusherView") {
          const v = payload as PusherView;
          if (v.propId !== propId) return;
          const s = shelf.current;
          s.prev = s.cur;
          s.cur = new Map(unpackShelf(v.coins).map((c) => [c.id, c]));
          s.at = now;
          s.t = v.t;
          s.tAt = now;
          let sum = 0;
          for (const c of s.cur.values()) sum += c.v;
          setShelfValue(sum);
        } else if (type === "pusherEvent") {
          const e = payload as PusherEvent;
          if (e.propId !== propId) return;
          if (e.kind === "drop") {
            dropping.current = { path: e.path, landed: e.landed, v: e.v, at: now, from: aimPos.current };
            e.path.forEach((_, i) => window.setTimeout(() => playSfx("peg", 0.7), DROP_ROW_MS * (i + 1)));
            window.setTimeout(() => {
              playSfx(e.landed ? "coinDrop" : "drain", 0.8);
              setBusy(false);
            }, DROP_ROW_MS * (e.path.length + 1));
          } else {
            for (const f of e.falls) falling.current.push({ x: f.x, v: f.v, gutter: f.gutter, at: now, paid: !f.gutter && e.paid > 0 });
            if (e.paid > 0) {
              setLastPaid({ n: e.paid, at: now });
              playSfx(e.paid >= bet * 10 ? "jackpot" : "coins");
            }
          }
        } else if (type === "pusherPurse") {
          const p = payload as PusherPurse;
          if (p.propId !== propId) return;
          setPurse(p);
        }
      }),
    [subscribeMessages, propId, bet]
  );

  // the cabinet, drawn every frame
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const box = el.getBoundingClientRect();
      const k = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(box.width * k));
      const H = Math.max(1, Math.round(box.height * k));
      if (el.width !== W || el.height !== H) {
        el.width = W;
        el.height = H;
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const now = performance.now();
      paint(ctx, W, H, now);
    };
    const paint = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
      ctx.clearRect(0, 0, W, H);
      const s = shelf.current;
      // --- the layout: the peg board over the shelf, the tray under it
      const boardTop = H * 0.04;
      const boardH = H * 0.33;
      const shelfTop = boardTop + boardH + H * 0.02;
      const shelfH = H * 0.44;
      const trayTop = shelfTop + shelfH;
      const cx = W / 2;
      const shelfWFront = W * 0.84;
      const widthAt = (y: number) => shelfWFront * (0.74 + 0.26 * y);
      const sx = (x: number, y: number) => cx + (x - 0.5) * widthAt(y);
      const sy = (y: number) => shelfTop + shelfH * y;
      const boardW = widthAt(0);
      const bx = (x: number) => cx + (x - 0.5) * boardW;
      const rowY = (r: number) => boardTop + boardH * (0.16 + (0.78 * (r + 0.5)) / PEG_ROWS);

      // the cabinet's back and the peg board
      const back = ctx.createLinearGradient(0, 0, 0, H);
      back.addColorStop(0, high ? "#1b1712" : "#3a0f1c");
      back.addColorStop(1, high ? "#0b0906" : "#1c070d");
      ctx.fillStyle = back;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = high ? "rgba(212,169,60,0.08)" : "rgba(122,30,46,0.35)";
      ctx.fillRect(bx(0), boardTop, boardW, boardH);
      ctx.strokeStyle = "#d9a843";
      ctx.lineWidth = Math.max(2, W * 0.004);
      ctx.strokeRect(bx(0), boardTop, boardW, boardH);
      // the side chutes: the house's outer lanes
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(bx(0), boardTop, boardW * PEG_CHUTE, boardH);
      ctx.fillRect(bx(1 - PEG_CHUTE), boardTop, boardW * PEG_CHUTE, boardH);
      const pegR = Math.max(2, W * 0.006);
      for (let r = 0; r < PEG_ROWS; r++) {
        const off = r % 2 ? PEG_KNOCK : 0;
        for (let x = PEG_CHUTE + off; x <= 1 - PEG_CHUTE + 1e-6; x += PEG_KNOCK * 2) {
          ctx.beginPath();
          ctx.fillStyle = "#f6dc8f";
          ctx.arc(bx(x), rowY(r), pegR, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = "#8a5a18";
          ctx.arc(bx(x) + pegR * 0.25, rowY(r) + pegR * 0.3, pegR * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // the dropper, sweeping along the top (its sweet spot in the middle)
      const pos = pusherBarPos(now - t0.current);
      aimPos.current = pos;
      if (aimText.current) aimText.current.textContent = `${Math.round(pusherAccuracy(pos) * 100)}%`;
      ctx.fillStyle = "rgba(80,220,150,0.28)";
      ctx.fillRect(bx(0.44), boardTop - H * 0.01, boardW * 0.12, H * 0.02);
      const dx = bx(pos);
      ctx.fillStyle = "#e0b04a";
      ctx.beginPath();
      ctx.roundRect(dx - W * 0.022, boardTop - H * 0.03, W * 0.044, H * 0.05, W * 0.008);
      ctx.fill();

      // the shelf in perspective: its bed, the rails, the gutter at the front-left corner
      ctx.beginPath();
      ctx.moveTo(sx(0, 0), sy(0));
      ctx.lineTo(sx(1, 0), sy(0));
      ctx.lineTo(sx(1, 1), sy(1));
      ctx.lineTo(sx(0, 1), sy(1));
      ctx.closePath();
      const bed = ctx.createLinearGradient(0, sy(0), 0, sy(1));
      bed.addColorStop(0, "#3b2012");
      bed.addColorStop(1, "#5a3218");
      ctx.fillStyle = bed;
      ctx.fill();
      ctx.strokeStyle = "#d9a843";
      ctx.lineWidth = Math.max(2, W * 0.005);
      ctx.beginPath();
      ctx.moveTo(sx(0, 0), sy(0));
      ctx.lineTo(sx(0, 1), sy(1));
      ctx.moveTo(sx(1, 0), sy(0));
      ctx.lineTo(sx(1, 1), sy(1));
      ctx.stroke();
      // the win tray, and the house's gutter in its left corner
      ctx.fillStyle = high ? "rgba(212,169,60,0.22)" : "rgba(255,215,120,0.14)";
      ctx.fillRect(sx(0, 1), trayTop + H * 0.015, widthAt(1), H * 0.12);
      ctx.fillStyle = "#070506";
      ctx.fillRect(sx(0, 1) - W * 0.012, sy(1) - H * 0.004, widthAt(1) * GUTTER_W + W * 0.012, H * 0.15);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `700 ${Math.round(H * 0.022)}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("HOUSE", sx(0, 1) - W * 0.008, trayTop + H * 0.1);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,230,160,0.55)";
      ctx.fillText("WIN TRAY", cx, trayTop + H * 0.1);

      // the shelf's coins (eased between the server's updates), back to front, and the plate
      const ease = Math.min(1, (now - s.at) / 110);
      const list: Coin[] = [];
      for (const c of s.cur.values()) {
        const p = s.prev.get(c.id);
        list.push(p ? { id: c.id, v: c.v, x: p.x + (c.x - p.x) * ease, y: p.y + (c.y - p.y) * ease } : c);
      }
      const plate = platePos(s.t + (now - s.tAt) / 1000);
      list.sort((a, b) => a.y - b.y);
      const drawCoin = (x: number, y: number, v: number, lift = 0, alpha = 1) => {
        const rx = COIN_R * widthAt(Math.min(1, Math.max(0, y)));
        const ry = rx * 0.5;
        const px = sx(x, Math.min(1, y));
        const py = sy(Math.min(1, y)) - lift;
        const [face, edge] = coinTone(v);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = edge;
        ctx.beginPath();
        ctx.ellipse(px, py + ry * 0.45, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e8c35a";
        ctx.lineWidth = Math.max(1, rx * 0.16);
        ctx.beginPath();
        ctx.ellipse(px, py, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      // the plate: a chrome block across the back, its face at `plate`
      const plateTop = sy(0) - H * 0.03;
      ctx.fillStyle = high ? "#c9a13a" : "#b9c0c7";
      ctx.beginPath();
      ctx.moveTo(sx(0, 0), plateTop);
      ctx.lineTo(sx(1, 0), plateTop);
      ctx.lineTo(sx(1, plate), sy(plate) - H * 0.03);
      ctx.lineTo(sx(0, plate), sy(plate) - H * 0.03);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = high ? "#7a5a18" : "#6c737a";
      ctx.fillRect(sx(0, plate), sy(plate) - H * 0.03, widthAt(plate), H * 0.03);
      for (const c of list) drawCoin(c.x, c.y, c.v);
      // the reach of the plate, faintly marked on the bed
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.setLineDash([4 * k0(W), 4 * k0(W)]);
      ctx.beginPath();
      ctx.moveTo(sx(0, PLATE_FRONT), sy(PLATE_FRONT));
      ctx.lineTo(sx(1, PLATE_FRONT), sy(PLATE_FRONT));
      ctx.stroke();
      ctx.setLineDash([]);

      // what is going over the edge: down into the tray, or the gutter
      falling.current = falling.current.filter((f) => now - f.at < 900);
      for (const f of falling.current) {
        const u = (now - f.at) / 900;
        drawCoin(f.x, 1, f.v, -H * 0.13 * u * u, 1 - u * 0.4);
        if (f.paid && u < 0.8) {
          ctx.fillStyle = `rgba(255,230,140,${1 - u})`;
          ctx.font = `800 ${Math.round(H * 0.03)}px system-ui, sans-serif`;
          ctx.fillText(`+${f.v}`, sx(f.x, 1), trayTop + H * 0.05 - u * H * 0.05);
        }
      }
      // the coin on its way down the pegs
      const d = dropping.current;
      if (d) {
        const e = (now - d.at) / DROP_ROW_MS;
        const rows = d.path.length;
        if (e > rows + 1.5) dropping.current = null;
        else {
          const r = Math.min(rows, Math.floor(e));
          const f = Math.min(1, e - r);
          const x0 = r === 0 ? d.from : d.path[r - 1];
          const x1 = r < rows ? d.path[r] : d.path[rows - 1];
          const y0 = r === 0 ? boardTop : rowY(r - 1);
          const y1 = r < rows ? rowY(r) : d.landed ? sy(PLATE_FRONT * 0.5) : boardTop + boardH;
          const px = bx(x0 + (x1 - x0) * f);
          const py = y0 + (y1 - y0) * f - Math.sin(Math.PI * f) * H * 0.012;
          const [face, edge] = coinTone(d.v);
          const rr = COIN_R * boardW;
          ctx.fillStyle = edge;
          ctx.beginPath();
          ctx.ellipse(px, py + rr * 0.15, rr * 0.35, rr, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = face;
          ctx.beginPath();
          ctx.ellipse(px, py, rr * 0.3, rr, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [high]);

  const drop = () => {
    if (busy) return;
    if (!free && (shown < bet || shown < LIMIT.min)) return;
    setBusy(true);
    // a drop the server turned down (too quick, short of chips, a full shelf) sends nothing back
    window.setTimeout(() => setBusy(false), 2600);
    playSfx("coinDrop", 0.5);
    onDrop(bet, aimPos.current);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      drop();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const paidRecently = lastPaid && performance.now() - lastPaid.at < 4000;

  return (
    <Modal landscape title={machine.name} icon={high ? "👑" : "🪙"} onClose={onClose} tone="velvet" placard={limitPlacard(LIMIT)}>
      <div className="flex min-h-0 flex-1 gap-4 max-sm:flex-col">
        <div className={`relative min-h-0 flex-1 overflow-hidden rounded-3xl border-4 ${high ? "border-amber-300" : "border-amber-300/70"} shadow-[inset_0_0_30px_rgba(0,0,0,0.7)]`}>
          <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" onPointerDown={() => drop()} aria-label="The coin pusher's cabinet: tap to drop a coin" />
          <div className="pointer-events-none absolute right-3 top-2 rounded-full border border-amber-300/40 bg-black/55 px-2 py-0.5 text-[10px] font-bold text-amber-100">
            On the shelf: <ChipAmount n={shelfValue} />
          </div>
        </div>

        <div className="flex w-[21rem] min-w-0 flex-col items-center justify-center gap-3 max-sm:w-full">
          <div className="min-h-6 text-center text-base font-extrabold text-amber-200" role="status">
            {paidRecently ? (
              <>
                Into the tray: +<ChipAmount n={lastPaid!.n} />
              </>
            ) : (
              <span className="text-sm opacity-80">
                Drop it in the green: <span ref={aimText}>0%</span> on target
              </span>
            )}
          </div>
          {free ? (
            <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-center text-xs font-bold text-emerald-100">
              {tokens.length} Bonus Token{tokens.length > 1 ? "s" : ""}: your next coin is free (<ChipAmount n={tokens[0]} />)
            </div>
          ) : (
            <BetPicker limit={LIMIT} chips={shown} value={bet} onChange={setStake} disabled={busy} label="Per coin" />
          )}
          <button type="button" onClick={drop} disabled={busy || (!free && (shown < bet || shown < LIMIT.min))} className={`clay-btn ${high ? "clay-btn-amber" : "clay-btn-rose"} min-h-14 w-full max-w-[16rem] text-base`}>
            DROP {free ? "(free)" : ""}
            <span className="kbd-hint text-xs opacity-70">· Space</span>
          </button>
          <ShortOfChips limit={LIMIT} chips={shown} coins={coins} />
          <div className="text-center text-[11px] opacity-60">Tap the cabinet or DROP. What the plate pushes into the tray is yours; a coin down an outer lane, or over the edge hugging the left rail, is the house's. The shelf stays as the last player left it.</div>
        </div>
      </div>
    </Modal>
  );
}

/** Canvas pixels per CSS pixel (for dashes that look the same on any screen). */
function k0(W: number) {
  return Math.max(1, W / 900);
}
