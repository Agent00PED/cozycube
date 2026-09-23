import { useState } from "react";
import type { BoardGameView } from "@shared/types";
import { Modal } from "./Modal";
import { playCardFlip, playClick } from "../../audio/sfx";

interface Props {
  view: BoardGameView | null;
  localSessionId: string;
  onJoin: () => void;
  onLeave: () => void;
  onMove: (from: number, to: number) => void;
  onClose: () => void;
}

// Checkers on the lounge table. The server owns the rules (board_join / board_move ->
// boardState); this is the board, the pieces and a tap-to-pick, tap-to-place cursor. Red sits
// at the top (row 0) and moves down; black at the bottom moves up. Everyone watching sees the
// same board.
export function BoardGameModal({ view, localSessionId, onJoin, onLeave, onMove, onClose }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const me = view ? (view.players.red === localSessionId ? "red" : view.players.black === localSessionId ? "black" : "") : "";
  const myTurn = !!view && me !== "" && view.turn === me && !view.winner && !!view.players.red && !!view.players.black;
  const mine = (c: number) => (me === "red" ? c === 1 || c === 3 : me === "black" ? c === 2 || c === 4 : false);

  const tap = (i: number) => {
    if (!view || !myTurn) return;
    const c = view.board[i];
    if (mine(c)) {
      playClick();
      setPicked(i);
      return;
    }
    if (picked !== null && c === 0) {
      playCardFlip();
      onMove(picked, i);
      setPicked(null);
    }
  };

  const status = !view
    ? "Setting up the board…"
    : view.winner
      ? `${view.winner === "red" ? view.names.red : view.names.black} wins! 🏆`
      : !view.players.red || !view.players.black
        ? "Waiting for a second player"
        : myTurn
          ? view.mustJump
            ? "Your move: you have to jump!"
            : "Your move"
          : `${view.turn === "red" ? view.names.red : view.names.black} is thinking…`;

  return (
    <Modal title="Checkers" icon="🔴" onClose={onClose} width={440}>
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="flex w-full items-center justify-between text-sm">
          <span className={`font-extrabold ${view?.turn === "red" && !view.winner ? "text-rose-300" : "opacity-60"}`}>🔴 {view?.names.red || "open seat"}</span>
          <span className={`font-extrabold ${view?.turn === "black" && !view.winner ? "text-stone-200" : "opacity-60"}`}>⚫ {view?.names.black || "open seat"}</span>
        </div>
        <div className="grid aspect-square w-full max-w-[320px] grid-cols-8 overflow-hidden rounded-2xl border border-amber-200/20" role="grid">
          {Array.from({ length: 64 }, (_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const dark = (row + col) % 2 === 1;
            const c = view?.board[i] ?? 0;
            const isPicked = picked === i;
            return (
              <button key={i} type="button" onClick={() => tap(i)} className={`relative flex items-center justify-center ${dark ? "bg-amber-900/80" : "bg-amber-100/80"} ${isPicked ? "ring-2 ring-inset ring-emerald-300" : ""}`} aria-label={`cell ${i}`}>
                {c !== 0 && <span className={`h-[72%] w-[72%] rounded-full shadow-inner ${c === 1 || c === 3 ? "bg-rose-500" : "bg-stone-800"} ${mine(c) && myTurn ? "ring-2 ring-white/40" : ""}`}>{(c === 3 || c === 4) && <span className="flex h-full items-center justify-center text-xs">👑</span>}</span>}
              </button>
            );
          })}
        </div>
        <div className="text-sm font-bold">{status}</div>
        <div className="flex gap-2">
          {me ? (
            <button type="button" className="clay-btn clay-btn-ghost" onClick={() => (playClick(), onLeave())}>
              Leave the table
            </button>
          ) : (
            <button type="button" className="clay-btn clay-btn-amber" disabled={!!view && !!view.players.red && !!view.players.black && !view.winner} onClick={() => (playClick(), onJoin())}>
              🪑 Take a seat
            </button>
          )}
        </div>
        <p className="text-xs opacity-60">Tap a piece, then the square. Jumps are compulsory. Winner takes 15 coins.</p>
      </div>
    </Modal>
  );
}
