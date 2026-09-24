import { useEffect, useRef, useState } from "react";
import { ARCADE_COINS_MAX, ARCADE_COINS_PER_POINT } from "@shared/types";
import { Modal } from "./Modal";

// A pocket Snake on a canvas: arrows / WASD / swipe buttons. Score goes to the server when the
// run ends (arcade_score), which pays a few coins once a minute.
const CELLS = 16;
const TICK_MS = 130;

interface Props {
  result: { coins: number } | null;
  onScore: (score: number) => void;
  onClose: () => void;
}

type Dir = [number, number];

export function RetroGameModal({ result, onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [run, setRun] = useState(0);
  const dirRef = useRef<Dir>([1, 0]);
  const nextDirRef = useRef<Dir>([1, 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let snake: [number, number][] = [
      [5, 8],
      [4, 8],
      [3, 8],
    ];
    let food: [number, number] = [11, 8];
    let points = 0;
    let alive = true;
    dirRef.current = [1, 0];
    nextDirRef.current = [1, 0];
    setScore(0);
    setOver(false);
    const size = canvas.width / CELLS;
    const placeFood = () => {
      do food = [Math.floor(Math.random() * CELLS), Math.floor(Math.random() * CELLS)];
      while (snake.some(([x, y]) => x === food[0] && y === food[1]));
    };
    const draw = () => {
      ctx.fillStyle = "#0d0d1c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1f1e3a";
      for (let i = 0; i <= CELLS; i++) {
        ctx.fillRect(i * size, 0, 1, canvas.height);
        ctx.fillRect(0, i * size, canvas.width, 1);
      }
      ctx.fillStyle = "#ff5fc8";
      ctx.fillRect(food[0] * size + 3, food[1] * size + 3, size - 6, size - 6);
      snake.forEach(([x, y], i) => {
        ctx.fillStyle = i === 0 ? "#a8ff5f" : "#4fe3ff";
        ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      });
    };
    const step = () => {
      if (!alive) return;
      const [dx, dy] = nextDirRef.current;
      // no reversing into yourself
      if (dx !== -dirRef.current[0] || dy !== -dirRef.current[1]) dirRef.current = [dx, dy];
      const [hx, hy] = snake[0];
      const nx = hx + dirRef.current[0];
      const ny = hy + dirRef.current[1];
      if (nx < 0 || ny < 0 || nx >= CELLS || ny >= CELLS || snake.some(([x, y]) => x === nx && y === ny)) {
        alive = false;
        setOver(true);
        if (points > 0) onScore(points);
        return;
      }
      snake = [[nx, ny], ...snake];
      if (nx === food[0] && ny === food[1]) {
        points += 10;
        setScore(points);
        placeFood();
      } else snake.pop();
      draw();
    };
    draw();
    const timer = window.setInterval(step, TICK_MS);
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
      const d = map[e.code];
      if (d) {
        e.preventDefault();
        e.stopPropagation();
        nextDirRef.current = d;
      }
    };
    // capture phase so the world's WASD steering never sees these keys while the game is up
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => {
  }, [result]);

  const pad = (d: Dir, label: string) => (
    <button type="button" className="clay-btn clay-btn-ghost h-12 w-12 text-lg" onPointerDown={() => (nextDirRef.current = d)} aria-label={label}>
      {label}
    </button>
  );

  return (
    <Modal title="Snake" icon="🕹️" onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="flex w-full items-center justify-between text-sm">
          <span className="font-extrabold tabular-nums">Score {score}</span>
          <span className="opacity-60">
            {Math.round(ARCADE_COINS_PER_POINT * 100) / 100} 🪙 per point, up to {ARCADE_COINS_MAX}
          </span>
        </div>
        <div className="relative">
          <canvas ref={canvasRef} width={288} height={288} className="rounded-2xl border border-cyan-300/30" />
          {over && (
            <div className="clay-pop absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-stone-950/70 text-center">
              <b className="text-xl">Game over</b>
              <span className="text-sm opacity-80">{score} points{result ? ` · ${result.coins > 0 ? `+${result.coins} 🪙` : "the cabinet is cooling down"}` : ""}</span>
              <button type="button" className="clay-btn clay-btn-amber" onClick={() => (setRun((r) => r + 1))}>
                ▶ Play again
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <span />
          {pad([0, -1], "▲")}
          <span />
          {pad([-1, 0], "◀")}
          {pad([0, 1], "▼")}
          {pad([1, 0], "▶")}
        </div>
        <p className="text-xs opacity-60">Arrow keys or WASD steer. Eat the pink pixels.</p>
      </div>
    </Modal>
  );
}
