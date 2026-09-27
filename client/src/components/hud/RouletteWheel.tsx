import { useEffect, useMemo, useRef } from "react";
import { ROULETTE_PHASE_SECONDS, WHEEL_ORDER, pocketColor, type RoulettePhase } from "@shared/casino";

// The European wheel over the betting board while it spins: 37 pockets in the wheel's own order,
// the wheel turning one way and the ball running the other along the track, spiralling in and
// dropping into the drawn number just as the spin ends (the room holds the number from the moment
// the croupier launches it: roulette.result). Everything moves by transforms set each frame on the
// SVG, never through React.

interface Props {
  phase: RoulettePhase;
  spinId: number;
  result: number;
  size?: number;
}

const N = WHEEL_ORDER.length;
const STEP = 360 / N;
const FILL = { red: "#b3202e", black: "#1c1c22", green: "#1f8a4c" } as const;
/** The ball's run: most of the spin (the rest it sits in its pocket, turning with the wheel). */
const RUN_S = ROULETTE_PHASE_SECONDS.spinning - 0.6;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export function RouletteWheel({ phase, spinId, result, size = 150 }: Props) {
  const wheel = useRef<SVGGElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const run = useRef<{ spinId: number; at: number; w0: number; W: number; b0: number; B: number; idle: number } | null>(null);
  const angle = useRef({ w: 0, b: 90 });

  // a new spin: the wheel's and the ball's runs, worked out so the ball ends in the result's pocket
  useEffect(() => {
    if (phase !== "spinning" || run.current?.spinId === spinId) return;
    const pocket = WHEEL_ORDER.indexOf(result);
    const w0 = angle.current.w;
    const W = 540 + Math.random() * 180;
    const b0 = angle.current.b;
    const target = w0 + W + (pocket >= 0 ? pocket : 0) * STEP;
    const B = ((((b0 - target) % 360) + 360) % 360) + 4 * 360;
    run.current = { spinId, at: performance.now(), w0, W, b0, B, idle: 0 };
  }, [phase, spinId, result]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = run.current;
      let rad = 0.9;
      if (r) {
        const u = Math.min(1, (now - r.at) / 1000 / RUN_S);
        if (u < 1) {
          angle.current.w = r.w0 + r.W * easeOut(u);
          angle.current.b = r.b0 - r.B * easeOut(u);
          // the ball runs the outer track, then spirals down into the pockets over the last third
          rad = u < 0.66 ? 0.9 : 0.9 - ((u - 0.66) / 0.34) * 0.22 + Math.abs(Math.sin(u * 40)) * 0.02 * (1 - u);
        } else {
          // settled: the ball rides its pocket as the wheel idles on
          r.idle += 12 * dt;
          angle.current.w = r.w0 + r.W + r.idle;
          angle.current.b = r.b0 - r.B + r.idle;
          rad = 0.68;
        }
      } else {
        angle.current.w += 12 * dt;
      }
      wheel.current?.setAttribute("transform", `rotate(${angle.current.w})`);
      if (ball.current) {
        const a = ((angle.current.b - 90) * Math.PI) / 180;
        ball.current.setAttribute("cx", String(Math.cos(a) * rad * 100));
        ball.current.setAttribute("cy", String(Math.sin(a) * rad * 100));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const wedges = useMemo(
    () =>
      WHEEL_ORDER.map((n, i) => {
        const a0 = ((i * STEP - STEP / 2 - 90) * Math.PI) / 180;
        const a1 = ((i * STEP + STEP / 2 - 90) * Math.PI) / 180;
        const [ro, ri] = [84, 58];
        const d = `M ${Math.cos(a0) * ro} ${Math.sin(a0) * ro} A ${ro} ${ro} 0 0 1 ${Math.cos(a1) * ro} ${Math.sin(a1) * ro} L ${Math.cos(a1) * ri} ${Math.sin(a1) * ri} A ${ri} ${ri} 0 0 0 ${Math.cos(a0) * ri} ${Math.sin(a0) * ri} Z`;
        const am = ((i * STEP - 90) * Math.PI) / 180;
        return { n, d, fill: FILL[pocketColor(n)], tx: Math.cos(am) * 75, ty: Math.sin(am) * 75, rot: i * STEP };
      }),
    []
  );

  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size} aria-label="The roulette wheel" role="img">
      <defs>
        <radialGradient id="rw-bowl" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#5a2a14" />
          <stop offset="100%" stopColor="#2a1208" />
        </radialGradient>
        <radialGradient id="rw-hub" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff2c0" />
          <stop offset="55%" stopColor="#d4a93c" />
          <stop offset="100%" stopColor="#7a5418" />
        </radialGradient>
      </defs>
      <circle r="99" fill="url(#rw-bowl)" stroke="#d4a93c" strokeWidth="2.5" />
      <circle r="90" fill="#3a1a0c" stroke="#8a6a2a" strokeWidth="1" />
      <g ref={wheel}>
        {wedges.map((w) => (
          <g key={w.n}>
            <path d={w.d} fill={w.fill} stroke="#d4a93c" strokeWidth="0.6" />
            <text x={w.tx} y={w.ty} fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${w.rot} ${w.tx} ${w.ty})`} fontFamily="'Cinzel Variable', Georgia, serif">
              {w.n}
            </text>
          </g>
        ))}
        <circle r="57" fill="#5a2a14" stroke="#d4a93c" strokeWidth="1.2" />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x="-2" y="-46" width="4" height="92" rx="2" fill="#c49a45" transform={`rotate(${k * 45})`} />
        ))}
        <circle r="16" fill="url(#rw-hub)" stroke="#7a5418" strokeWidth="1" />
      </g>
      <circle ref={ball} r="4.2" fill="#fbfbf6" stroke="#9a9a94" strokeWidth="0.6" cx="0" cy="-90" />
    </svg>
  );
}
