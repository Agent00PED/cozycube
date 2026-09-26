import { useEffect, useMemo, useRef, useState } from "react";
import { CONSTELLATIONS, CONSTELLATION_COINS, CONSTELLATION_MIN_S, STAR_SPARK_COINS, type CampfirePacket, type ConstellationDone, type MeteorShower, type ShootingStar, type StarCaught } from "@shared/types";
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
// open) shows a round window on the night sky: three depths of stars drifting at their own speeds
// (the lens follows the pointer a little, so they slide past each other), soft clouds drifting
// across and hiding whatever is behind them, and two games in it at once:
//
//   meteor showers   every few seconds a shower of shooting stars (the server sends it) streaks
//                    across at their own speeds and slants; tap them as they go. Catching one
//                    after another without letting one slip away builds a combo: x2, x3, x5 Star
//                    Sparks (the server keeps the chain and pays it)
//   constellations   the numbered stars of a constellation twinkle in the sky; tap them in order
//                    and the lines join up and the picture it makes (Ursa Chibi, the Starlight Cat)
//                    glows into view, for CONSTELLATION_COINS (the server checks it took a person's time)

const SIZE = 320;
const HIT_STREAK = 44;
const HIT_STAR = 24;

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

/** Clouds: each a cluster of soft puffs, drifting right to left at its own pace. */
const CLOUDS = [
  { y: 0.24, speed: 0.022, phase: 0.1, size: 1.0 },
  { y: 0.58, speed: 0.016, phase: 0.55, size: 1.25 },
  { y: 0.82, speed: 0.027, phase: 0.8, size: 0.85 },
];

type Streak = ShootingStar & { start: number; hit: boolean; gone: boolean };
type Burst = { x: number; y: number; at: number; text: string };

/** Multi-focal lens: each constellation's stars lie in three depth planes (stars 1-3, 4-6, 7-8 in
 *  tracing order). Each plane comes into focus at its own place on the focus slider, somewhere in
 *  its zone (near, mid, far), and is sharp within FOCUS_TOLERANCE of it: only then can its stars
 *  be seen clearly and linked. */
const FOCUS_ZONES: readonly (readonly [number, number])[] = [
  [0.2, 0.35],
  [0.5, 0.65],
  [0.8, 0.95],
];
const ZONE_NAMES = ["Near", "Mid", "Far"];
const FOCUS_TOLERANCE = 0.08;
/** Where the ring starts: nothing in focus. */
const FOCUS_START = 0.05;
/** A constellation's three depth planes: a focus somewhere in each zone. */
function rollBands(): number[] {
  return FOCUS_ZONES.map(([lo, hi]) => lo + Math.random() * (hi - lo));
}
/** The depth plane of each star (by its place in the tracing order). */
function planeOf(k: number, count: number): number {
  return Math.min(2, Math.floor(k / Math.ceil(count / 3)));
}

export function StargazingModal({ send, subscribeMessages, localSessionId, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const streaks = useRef<Streak[]>([]);
  const aim = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const bursts = useRef<Burst[]>([]);
  const lastHit = useRef<{ x: number; y: number } | null>(null);
  const opened = useRef(performance.now());
  // the constellation being traced: which one, how many of its stars are joined, when it finished;
  // its three depth planes' focus points, and which plane the ring has in focus (-1: none)
  const firstBands = useMemo(() => rollBands(), []);
  const trace = useRef({ index: 0, joined: 0, doneAt: 0, all: false, bands: firstBands, plane: -1 });
  // the focus ring's setting (0..1), and where a drag round the brass ring began
  const focusRef = useRef(FOCUS_START);
  const [focus, setFocusState] = useState(FOCUS_START);
  const setFocus = (v: number) => {
    focusRef.current = Math.max(0, Math.min(1, v));
    setFocusState(focusRef.current);
  };
  const ringDrag = useRef<{ angle: number; focus: number } | null>(null);
  // the last constellation's trace went to the server then (the next is timed from it)
  const lastSent = useRef(performance.now());
  const [sparks, setSparks] = useState(0);
  const [combo, setCombo] = useState({ n: 0, mult: 1 });
  const comboRef = useRef(combo);
  comboRef.current = combo;
  const [traced, setTraced] = useState<string[]>([]);
  const [note, setNote] = useState("Tap shooting stars as they streak by. The constellation's stars lie at three depths: focus near, mid, then far to link them in order");

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
        if (type === "meteorShower") {
          const now = performance.now();
          for (const s of (payload as MeteorShower).stars) streaks.current.push({ ...s, start: now + s.delay * 1000, hit: false, gone: false });
        } else if (type === "starCaught" && (payload as StarCaught).sessionId === localSessionId) {
          const c = payload as StarCaught;
          playSfx("star");
          setSparks((n) => n + 1);
          setCombo({ n: c.combo, mult: c.multiplier });
          const at = lastHit.current ?? { x: SIZE / 2, y: SIZE / 2 };
          bursts.current.push({ ...at, at: performance.now(), text: c.coins > 0 ? `+${c.coins}${c.multiplier > 1 ? ` x${c.multiplier}` : ""}` : "✨" });
          setNote(c.multiplier > 1 ? `Combo x${c.multiplier}! Keep them coming` : c.capped ? "A Star Spark! (today's star coins are all earned)" : `Star Spark! +${c.coins} coins`);
        } else if (type === "constellationDone" && (payload as ConstellationDone).sessionId === localSessionId) {
          const d = payload as ConstellationDone;
          const shape = CONSTELLATIONS.find((c) => c.id === d.id);
          playSfx("golden");
          setTraced((list) => [...list, d.id]);
          bursts.current.push({ x: SIZE / 2, y: SIZE * 0.2, at: performance.now(), text: d.coins > 0 ? `${shape?.emoji ?? "✨"} +${d.coins}` : `${shape?.emoji ?? "✨"}` });
          setNote(d.coins > 0 ? `${shape?.name}! +${d.coins} coins` : `${shape?.name}! (today's star coins are all earned)`);
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
      const now = performance.now();
      const t = now / 1000;
      const a = aim.current;
      a.x += (a.tx - a.x) * 0.06;
      a.y += (a.ty - a.y) * 0.06;
      const sky = g.createRadialGradient(SIZE * 0.5, SIZE * 0.45, 20, SIZE / 2, SIZE / 2, SIZE * 0.72);
      sky.addColorStop(0, "#1c2440");
      sky.addColorStop(0.6, "#0f1426");
      sky.addColorStop(1, "#070910");
      g.fillStyle = sky;
      g.fillRect(0, 0, SIZE, SIZE);
      const band = g.createLinearGradient(0, SIZE, SIZE, 0);
      band.addColorStop(0.35, "rgba(120,110,190,0)");
      band.addColorStop(0.5, "rgba(150,140,220,0.13)");
      band.addColorStop(0.65, "rgba(120,110,190,0)");
      g.fillStyle = band;
      g.fillRect(0, 0, SIZE, SIZE);
      // the three depths of stars
      LAYERS.forEach((layer, li) => {
        const ox = -a.x * layer.depth + Math.sin(t * 0.05 + li) * layer.depth * 0.3;
        const oy = -a.y * layer.depth + t * 0.6 * (li + 1);
        for (const d of layer.dots) {
          const x = (((d.x * SIZE + ox) % (SIZE * 1.3)) + SIZE * 1.3) % (SIZE * 1.3) - SIZE * 0.15;
          const y = (((d.y * SIZE + oy) % (SIZE * 1.3)) + SIZE * 1.3) % (SIZE * 1.3) - SIZE * 0.15;
          g.globalAlpha = layer.alpha * (0.55 + 0.45 * Math.sin(t * d.rate + d.phase));
          g.fillStyle = li === 2 ? "#fff6dc" : "#dfe6ff";
          g.beginPath();
          g.arc(x, y, d.r, 0, Math.PI * 2);
          g.fill();
        }
      });
      g.globalAlpha = 1;

      // the constellation being traced (on the middle depth, so it moves with the sky a little)
      const cx = -a.x * LAYERS[1].depth;
      const cy = -a.y * LAYERS[1].depth;
      const tr = trace.current;
      const shape = CONSTELLATIONS[tr.index];
      if (shape && !tr.all) {
        const pts = shape.stars.map(([px, py]) => [px * SIZE + cx, py * SIZE + cy] as const);
        const revealed = tr.joined >= pts.length;
        // which depth plane the ring has in focus: entering one clicks, and says whose stars they are
        const f = focusRef.current;
        const plane = tr.bands.findIndex((b) => Math.abs(f - b) <= FOCUS_TOLERANCE);
        if (plane !== tr.plane) {
          tr.plane = plane;
          if (plane >= 0 && !revealed) {
            playSfx("focus");
            const members = pts.map((_, k) => k).filter((k) => planeOf(k, pts.length) === plane);
            const nextPlane = planeOf(Math.min(tr.joined, pts.length - 1), pts.length);
            setNote(
              plane === nextPlane
                ? `${ZONE_NAMES[plane]} stars ${members[0] + 1}-${members[members.length - 1] + 1} in focus: link them!`
                : `${ZONE_NAMES[plane]} stars ${members[0] + 1}-${members[members.length - 1] + 1} in focus, but next is star ${tr.joined + 1} (${ZONE_NAMES[nextPlane].toLowerCase()})`
            );
          }
        }
        // the lines joined so far (closing the loop once complete)
        g.strokeStyle = revealed ? "rgba(255, 228, 158, 0.95)" : "rgba(255, 228, 158, 0.55)";
        g.lineWidth = revealed ? 2 : 1.5;
        g.beginPath();
        for (let k = 1; k < Math.min(tr.joined, pts.length); k++) {
          g.moveTo(pts[k - 1][0], pts[k - 1][1]);
          g.lineTo(pts[k][0], pts[k][1]);
        }
        if (revealed) {
          g.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
          g.lineTo(pts[0][0], pts[0][1]);
        }
        g.stroke();
        // once complete, the picture glows into view
        if (revealed) {
          const k = Math.min(1, (now - tr.doneAt) / 900);
          g.strokeStyle = `rgba(255, 244, 214, ${0.9 * k})`;
          g.lineWidth = 2.2;
          g.lineCap = "round";
          for (const line of shape.art) {
            g.beginPath();
            line.forEach(([px, py], i) => (i === 0 ? g.moveTo(px * SIZE + cx, py * SIZE + cy) : g.lineTo(px * SIZE + cx, py * SIZE + cy)));
            g.stroke();
          }
          g.fillStyle = `rgba(255, 228, 158, ${k})`;
          g.font = "700 13px Fredoka, system-ui, sans-serif";
          g.textAlign = "center";
          g.fillText(`${shape.emoji} ${shape.name}`, SIZE / 2 + cx, SIZE * 0.88 + cy);
          g.textAlign = "start";
          // on to the next one after a moment, with its own depth planes
          if (now - tr.doneAt > 2800) {
            tr.index += 1;
            tr.joined = 0;
            tr.bands = rollBands();
            tr.plane = -1;
            if (tr.index >= CONSTELLATIONS.length) tr.all = true;
            else setNote("A new patch of sky: find the near stars' focus first");
          }
        }
        // its stars. A star in the plane in focus is crisp and bright; the rest are heavy, faint
        // blurs (the farther off, the heavier). Joined stars stay lit. The in-focus stars not yet
        // joined wear a target reticle, and the next to tap pulses, numbered
        pts.forEach(([px, py], k) => {
          const own = tr.bands[planeOf(k, pts.length)];
          const off = Math.abs(f - own);
          const crisp = revealed || k < tr.joined || off <= FOCUS_TOLERANCE;
          g.filter = crisp ? "none" : `blur(${Math.min(8, 3 + (off - FOCUS_TOLERANCE) * 18).toFixed(1)}px)`;
          const next = k === tr.joined && !revealed && crisp;
          const tw = 0.6 + 0.4 * Math.sin(t * 2.2 + k * 1.3);
          g.fillStyle = k < tr.joined ? "rgba(255, 236, 170, 1)" : crisp ? `rgba(255, 244, 214, ${0.7 + 0.3 * tw})` : "rgba(255, 244, 214, 0.28)";
          g.beginPath();
          g.arc(px, py, next ? 3.2 + tw * 1.4 : crisp ? 2.6 : 3.6, 0, Math.PI * 2);
          g.fill();
          if (crisp && !revealed && k >= tr.joined) {
            // the golden target reticle: a ring with four ticks (the next star's pulsing)
            const r = next ? 8 + tw * 3 : 7;
            g.strokeStyle = next ? `rgba(255, 209, 102, ${0.55 + 0.45 * tw})` : "rgba(255, 209, 102, 0.5)";
            g.lineWidth = 1.2;
            g.beginPath();
            g.arc(px, py, r, 0, Math.PI * 2);
            for (let q = 0; q < 4; q++) {
              const ang = (q * Math.PI) / 2 + t * 0.6;
              g.moveTo(px + Math.cos(ang) * (r + 2), py + Math.sin(ang) * (r + 2));
              g.lineTo(px + Math.cos(ang) * (r + 5), py + Math.sin(ang) * (r + 5));
            }
            g.stroke();
            g.fillStyle = "rgba(255, 244, 214, 0.8)";
            g.font = "700 9px Fredoka, system-ui, sans-serif";
            g.fillText(String(k + 1), px + 6, py - 6);
          }
        });
        g.filter = "none";
      }

      // the meteor shower: bright heads and fading tails, each at its own speed
      for (const s of streaks.current) {
        if (s.hit || s.gone || now < s.start) continue;
        const p = (now - s.start) / (s.duration * 1000);
        if (p > 1.15) {
          s.gone = true;
          // one got away: the chain breaks (the server's does too)
          if (comboRef.current.n > 0) setCombo({ n: 0, mult: 1 });
          continue;
        }
        const head = { x: (s.x0 + (s.x1 - s.x0) * p) * SIZE, y: (s.y0 + (s.y1 - s.y0) * p) * SIZE };
        const back = Math.max(0, p - 0.2);
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
      streaks.current = streaks.current.filter((s) => !s.hit && !s.gone);

      // the clouds, drifting across and hiding what is behind them
      for (const c of CLOUDS) {
        const x = ((1.4 - ((t * c.speed + c.phase) % 1.8)) * SIZE) | 0;
        const y = c.y * SIZE - a.y * 4;
        for (let k = 0; k < 5; k++) {
          const px = x + (k - 2) * 26 * c.size;
          const py = y + Math.sin(k * 1.7) * 9 * c.size;
          const r = (28 + (k % 2) * 10) * c.size;
          const puff = g.createRadialGradient(px, py, 0, px, py, r);
          puff.addColorStop(0, "rgba(58, 64, 92, 0.62)");
          puff.addColorStop(0.6, "rgba(44, 50, 76, 0.4)");
          puff.addColorStop(1, "rgba(30, 34, 54, 0)");
          g.fillStyle = puff;
          g.beginPath();
          g.arc(px, py, r, 0, Math.PI * 2);
          g.fill();
        }
      }

      // catches and constellations: rings of sparks and the coins
      bursts.current = bursts.current.filter((b) => now - b.at < 1500);
      for (const b of bursts.current) {
        const k = (now - b.at) / 1500;
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
    const p = toLens(e);
    const now = performance.now();
    // a shooting star first: anywhere near its head
    for (const s of streaks.current) {
      if (s.hit || now < s.start) continue;
      const k = Math.min(1, (now - s.start) / (s.duration * 1000));
      const head = { x: (s.x0 + (s.x1 - s.x0) * k) * SIZE, y: (s.y0 + (s.y1 - s.y0) * k) * SIZE };
      if (Math.hypot(p.x - head.x, p.y - head.y) <= HIT_STREAK) {
        s.hit = true;
        lastHit.current = head;
        sendRef.current({ type: "STAR_CATCH", id: s.id });
        return;
      }
    }
    // otherwise the constellation's next star
    const tr = trace.current;
    const shape = CONSTELLATIONS[tr.index];
    if (!shape || tr.all || tr.joined >= shape.stars.length) return;
    const cx = -aim.current.x * LAYERS[1].depth;
    const cy = -aim.current.y * LAYERS[1].depth;
    const [sx, sy] = shape.stars[tr.joined];
    if (Math.hypot(p.x - (sx * SIZE + cx), p.y - (sy * SIZE + cy)) > HIT_STAR) return;
    // a blurred star cannot be picked out: its depth plane has to be in focus
    const plane = planeOf(tr.joined, shape.stars.length);
    if (Math.abs(focusRef.current - tr.bands[plane]) > FOCUS_TOLERANCE) {
      setNote(`Star ${tr.joined + 1} is a blur: turn the focus toward the ${ZONE_NAMES[plane].toLowerCase()} zone`);
      return;
    }
    tr.joined += 1;
    playSfx("pluck");
    if (tr.joined === shape.stars.length) {
      tr.doneAt = now;
      // the server wants to see each took a person's time; if this was quicker, it waits a beat
      const wait = Math.max(0, CONSTELLATION_MIN_S * 1000 + 250 - (now - Math.max(opened.current, lastSent.current)));
      lastSent.current = now + wait;
      window.setTimeout(() => sendRef.current({ type: "CONSTELLATION", id: shape.id }), wait);
    }
  };
  // the brass ring round the lens turns the focus: drag round it (a full turn sweeps the range)
  const ringAngle = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const onRingDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // the lens itself takes its own taps
    e.currentTarget.setPointerCapture(e.pointerId);
    ringDrag.current = { angle: ringAngle(e), focus: focusRef.current };
  };
  const onRingMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = ringDrag.current;
    if (!d) return;
    let turn = ringAngle(e) - d.angle;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    setFocus(d.focus + turn / (Math.PI * 2));
    d.angle = ringAngle(e);
    d.focus = focusRef.current;
  };
  const onRingUp = () => {
    ringDrag.current = null;
  };

  return (
    <Modal title="Stargazing" icon="🔭" onClose={onClose} width={400}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <div
          className="relative cursor-grab touch-none rounded-full p-[14px] active:cursor-grabbing"
          style={{
            width: "min(340px, 78vw)",
            aspectRatio: "1",
            // the knurled brass focus ring: it turns as you drag it
            background: `repeating-conic-gradient(from ${Math.round(focus * 360)}deg, rgba(0,0,0,0.18) 0deg 3deg, rgba(0,0,0,0) 3deg 9deg), conic-gradient(from ${210 + Math.round(focus * 360)}deg, #7a5a22, #e8c46a, #9a7428, #f3d98c, #7a5a22, #d9b25a, #7a5a22)`,
            boxShadow: "0 6px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,240,200,0.6)",
          }}
          onPointerDown={onRingDown}
          onPointerMove={onRingMove}
          onPointerUp={onRingUp}
          onPointerCancel={onRingUp}
          title="The focus ring: drag it round"
        >
          <canvas
            ref={canvas}
            className="block h-full w-full cursor-crosshair touch-none rounded-full"
            style={{ boxShadow: "inset 0 0 28px 10px rgba(0,0,0,0.85)" }}
            onPointerMove={onMove}
            onPointerDown={onTap}
            aria-label="The night sky through the telescope: tap shooting stars, and trace the numbered stars in order"
          />
          <div className="pointer-events-none absolute inset-[10px] rounded-full" style={{ boxShadow: "inset 0 0 26px 12px rgba(4,6,12,0.9)" }} />
          {combo.mult > 1 && (
            <div key={combo.n} className="clay-pop pointer-events-none absolute right-2 top-2 rounded-full bg-amber-300 px-2.5 py-1 text-sm font-extrabold text-amber-950 shadow-lg">
              Combo x{combo.mult}
            </div>
          )}
        </div>
        <label className="flex w-full max-w-[300px] items-center gap-2 pb-3 text-xs font-semibold">
          <span aria-hidden>🔍</span>
          <span className="opacity-80">Focus</span>
          <span className="relative flex-1">
            <input type="range" min={0} max={1000} value={Math.round(focus * 1000)} onChange={(e) => setFocus(Number(e.target.value) / 1000)} className="cozy-focus w-full accent-amber-300" aria-label="Focus ring" />
            {/* the three depth zones, faintly marked under the track */}
            <span className="pointer-events-none absolute inset-x-0 -bottom-3 text-[9px] font-bold uppercase tracking-wide opacity-45" aria-hidden>
              {FOCUS_ZONES.map(([lo, hi], i) => (
                <span key={i} className="absolute -translate-x-1/2" style={{ left: `${((lo + hi) / 2) * 100}%` }}>
                  {ZONE_NAMES[i]}
                </span>
              ))}
            </span>
          </span>
        </label>
        <p className="m-0 min-h-[20px] text-center text-sm opacity-80">{note}</p>
        <p className="m-0 text-center text-[11px] opacity-60">
          Star Sparks: {sparks} · {STAR_SPARK_COINS} 🪙 each, x2, x3, x5 in a row · constellations traced: {traced.length}/{CONSTELLATIONS.length} (+{CONSTELLATION_COINS} 🪙 each)
        </p>
      </div>
    </Modal>
  );
}
