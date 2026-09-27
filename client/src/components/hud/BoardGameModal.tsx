import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardGameType, BoardGameView, BoardPacket, BoardSide } from "@shared/types";
import { Modal } from "./Modal";

interface Props {
  view: BoardGameView | null;
  localSessionId: string;
  send: (packet: BoardPacket) => void;
  onClose: () => void;
}

// The games table on the pink rug: chess or checkers for two, and anyone may look on.
//
// The server owns the rules and the board (server/src/rooms/boardgame.ts) and broadcasts the
// whole table after every change; this panel only draws that view and sends packets. Opening it
// registers you as a watcher (BOARD_WATCH), which also fetches the table as it stands.
//
// One 16:9 landscape table with no scrolling at all:
//
//   the board    in the middle, as big as the panel allows: a thick 2.5D walnut frame round a
//                maple-and-walnut field, carved ivory pieces against walnut ones (chess stands its
//                pieces up; checkers lays discs, a king crowned). Your own side at the bottom; tap
//                a piece to light where it can go (glowing green, a capture glowing red: the legal
//                moves come from the server), tap a light to move. The last move, check, and a
//                promotion picker.
//   the sides    a player card each: the player across the board on the left, you (or White) on
//                the right. Each has the seat (Sit / Leave), the player's clock (their thinking
//                time this game) and the tray of pieces they have captured. The left card also
//                picks the game; the right one has the status and the players' controls (offer or
//                accept a draw, resign, a rematch, switch games).
//
// Walking up to the table has already seated you if a seat was free (the server routes a second
// player to the opposite chair); with both seats taken, you watch. Closing the panel gets you up
// from the table, seat and chair together (in the middle of a game, only after a second tap: it
// forfeits).

const GAME_NAMES: Record<BoardGameType, { name: string; icon: string }> = {
  chess: { name: "Chess", icon: "♟️" },
  checkers: { name: "Checkers", icon: "⛀" },
};
const SIDE_NAMES: Record<BoardSide, string> = { w: "Ivory", b: "Walnut" };
const PROMOTIONS: ("q" | "r" | "b" | "n")[] = ["q", "r", "b", "n"];
const FILES = "abcdefgh";
/** A full set, by piece: what a side started with (captures are what is missing from it). */
const CHESS_SET: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const other = (s: BoardSide): BoardSide => (s === "w" ? "b" : "w");

export function BoardGameModal({ view, localSessionId, send, onClose }: Props) {
  // registered as a watcher for as long as the panel is open (and fetch the table now); again
  // under a new session (a reconnect that came back as a new player), so the board keeps updating
  // instead of freezing on the old session's last view
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    sendRef.current({ type: "BOARD_WATCH", watching: true });
    return () => sendRef.current({ type: "BOARD_WATCH", watching: false });
  }, [localSessionId]);

  const mySide: BoardSide | "" = view ? (view.seats.w === localSessionId ? "w" : view.seats.b === localSessionId ? "b" : "") : "";
  const underWay = !!view && view.moves > 0 && view.phase !== "over";

  // closing gets you up from the table; mid-game it asks once more, since it forfeits
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (!confirmClose) return;
    const t = window.setTimeout(() => setConfirmClose(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClose]);
  const close = () => {
    if (mySide && underWay && !confirmClose) return setConfirmClose(true);
    if (mySide) send({ type: "BOARD_LEAVE" });
    onClose();
  };

  const clocks = useClocks(view);
  // you (or Ivory, watching) at the bottom and on the right; across the board on the left
  const bottom: BoardSide = mySide || "w";
  const top = other(bottom);

  return (
    <Modal title="Chess & Checkers" icon="♟️" onClose={close} landscape>
      <CarvingGradients />
      {confirmClose && (
        <div className="mb-1.5 shrink-0 rounded-2xl bg-rose-400/20 px-3 py-1.5 text-center text-xs font-semibold text-rose-100" role="alert">
          Closing leaves the table and forfeits this game. Close again to leave.
        </div>
      )}
      {!view ? (
        <p className="m-auto text-center text-sm opacity-70">Setting up the table…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
          {/* ---- the player across the board, and the game ---- */}
          <aside className="flex shrink-0 flex-row gap-2 sm:w-[23%] sm:min-w-[190px] sm:max-w-[260px] sm:flex-col">
            <SeatCard view={view} side={top} mySide={mySide} underWay={underWay} clock={clocks[top]} send={send} />
            <div className="hidden min-h-0 flex-1 flex-col gap-2 sm:flex">
              <GamePicker view={view} mySide={mySide} underWay={underWay} send={send} />
              <p className="m-0 text-[11px] leading-snug opacity-60">
                {GAME_NAMES[view.gameType].icon} {view.gameType === "checkers" ? "Captures are compulsory and chain on; a crowned king flies along the diagonals." : "Tap a piece to light its moves; a red glow is a capture."} A win pays 15 coins.
              </p>
              <Watchers view={view} />
            </div>
          </aside>

          {/* ---- the board ---- */}
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
            <Board view={view} mySide={mySide} send={send} />
          </div>

          {/* ---- you (or Ivory), the state of play, and the controls ---- */}
          <aside className="flex shrink-0 flex-row gap-2 sm:w-[23%] sm:min-w-[190px] sm:max-w-[260px] sm:flex-col">
            <SeatCard view={view} side={bottom} mySide={mySide} underWay={underWay} clock={clocks[bottom]} send={send} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <StatusBadge view={view} mySide={mySide} />
              {mySide ? <Controls view={view} mySide={mySide} send={send} /> : <span className="self-center rounded-full bg-sky-300/15 px-2.5 py-1 text-xs font-semibold text-sky-100">👀 Spectating</span>}
              <div className="sm:hidden">
                <GamePicker view={view} mySide={mySide} underWay={underWay} send={send} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// the clocks

/** Each side's thinking time now (ms): the view's, the running side's counting on from when it
 *  arrived. Re-renders twice a second while a clock runs. */
function useClocks(view: BoardGameView | null): Record<BoardSide, number> {
  const arrived = useRef({ view, at: performance.now() });
  if (arrived.current.view !== view) arrived.current = { view, at: performance.now() };
  const running = view?.clockSide ?? "";
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [running]);
  const base = view?.clocks ?? { w: 0, b: 0 };
  const since = performance.now() - arrived.current.at;
  return { w: base.w + (running === "w" ? since : 0), b: base.b + (running === "b" ? since : 0) };
}

const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

// ---------------------------------------------------------------------------------------------
// the sides

/** The pieces `side` has taken from the other, best first (chess counts promotions back in), and
 *  the material lead that gives in chess. */
function captures(view: BoardGameView, side: BoardSide): { pieces: string[]; lead: number } {
  const foe = other(side);
  const count = (s: BoardSide, k: string) => view.cells.filter((c) => c === `${s}${k}`).length;
  if (view.gameType === "checkers") {
    const left = view.cells.filter((c) => c[0] === foe).length;
    return { pieces: Array.from({ length: Math.max(0, 12 - left) }, () => `${foe}m`), lead: 0 };
  }
  const taken = (s: BoardSide) => {
    // a promoted pawn turned into a piece past the set's count: it was not taken
    const extra = (["q", "r", "b", "n"] as const).reduce((n, k) => n + Math.max(0, count(s, k) - CHESS_SET[k]), 0);
    const out: string[] = [];
    for (const k of ["q", "r", "b", "n"]) for (let i = count(s, k); i < CHESS_SET[k]; i++) out.push(`${s}${k}`);
    for (let i = count(s, "p") + extra; i < CHESS_SET.p; i++) out.push(`${s}p`);
    return out;
  };
  const mine = taken(foe);
  const theirs = taken(side);
  const worth = (list: string[]) => list.reduce((n, c) => n + PIECE_VALUE[c[1]], 0);
  return { pieces: mine, lead: worth(mine) - worth(theirs) };
}

function SeatCard({ view, side, mySide, underWay, clock, send }: { view: BoardGameView; side: BoardSide; mySide: BoardSide | ""; underWay: boolean; clock: number; send: (p: BoardPacket) => void }) {
  const taken = view.seats[side];
  const mine = mySide === side;
  const toMove = view.phase === "playing" && view.turn === side;
  const won = view.phase === "over" && view.result === side;
  const { pieces, lead } = captures(view, side);
  return (
    <section className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl p-2.5 outline outline-1 -outline-offset-1 transition-colors sm:flex-none ${toMove ? "bg-emerald-300/12 outline-emerald-300/45 shadow-[0_0_18px_rgba(110,231,183,0.18)]" : won ? "bg-amber-300/15 outline-amber-300/50" : "bg-white/5 outline-white/10"}`} aria-label={`${SIDE_NAMES[side]} seat`}>
      <div className="flex items-center gap-2">
        {view.gameType === "chess" ? <ChessPiece cell={`${side}k`} size={34} /> : <Carved side={side} size={30} />}
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className="truncate text-sm">{taken ? view.names[side] : <span className="opacity-50">Open seat</span>}</b>
          <span className="text-[10.5px] font-bold uppercase tracking-widest opacity-60">
            {SIDE_NAMES[side]} {side === "w" ? "· moves first" : ""}
          </span>
        </div>
        {toMove && <span className="clay-ring-dot" aria-label="to move" />}
        {won && <span aria-label="winner">🏆</span>}
      </div>
      {/* the clock */}
      <div className={`flex items-center justify-between rounded-xl px-2.5 py-1 font-mono text-lg font-bold tabular-nums ${toMove ? "bg-emerald-950/60 text-emerald-100" : "bg-black/30 text-stone-200/80"}`} aria-label={`${SIDE_NAMES[side]}'s clock`}>
        <span className="text-[11px] font-semibold not-italic opacity-60">⏱</span>
        {clockText(clock)}
      </div>
      {/* the captured tray */}
      <div className="flex min-h-[30px] flex-wrap items-center gap-0.5 rounded-xl bg-[#3a2416]/60 px-1.5 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)]" aria-label={`Pieces ${SIDE_NAMES[side]} has captured`}>
        {pieces.length === 0 ? (
          <span className="px-1 text-[10.5px] opacity-45">No captures yet</span>
        ) : (
          pieces.map((c, i) => (
            <span key={i} className="leading-none">
              {view.gameType === "chess" ? <ChessPiece cell={c} size={18} /> : <Carved side={c[0] as BoardSide} size={14} />}
            </span>
          ))
        )}
        {lead > 0 && <span className="ml-auto text-[11px] font-black text-amber-200">+{lead}</span>}
      </div>
      {taken && view.away?.[side] && <Away />}
      {mine ? (
        <button type="button" className="clay-btn clay-btn-ghost min-h-9 w-full text-xs" onClick={() => send({ type: "BOARD_LEAVE" })}>
          Leave seat
        </button>
      ) : !taken ? (
        <button type="button" className="clay-btn clay-btn-amber min-h-9 w-full text-xs" disabled={!!mySide && underWay} onClick={() => send({ type: "BOARD_SIT", seat: side })}>
          🪑 Sit as {SIDE_NAMES[side]}
        </button>
      ) : null}
    </section>
  );
}

function GamePicker({ view, mySide, underWay, send }: { view: BoardGameView; mySide: BoardSide | ""; underWay: boolean; send: (p: BoardPacket) => void }) {
  const canChoose = !underWay && (!!mySide || (!view.seats.w && !view.seats.b));
  return (
    <div className="flex gap-1 rounded-full bg-black/30 p-1 outline outline-1 -outline-offset-1 outline-white/10" role="radiogroup" aria-label="Game">
      {(["chess", "checkers"] as BoardGameType[]).map((g) => {
        const on = view.gameType === g;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!canChoose && !on}
            onClick={() => canChoose && !on && send({ type: "BOARD_SELECT", gameType: g })}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 ${on ? "bg-[#fff4e0] text-stone-900 shadow-[0_2px_8px_rgba(0,0,0,0.35)]" : "text-stone-200 hover:bg-white/10"}`}
          >
            <span className="text-base leading-none">{GAME_NAMES[g].icon}</span>
            {GAME_NAMES[g].name}
          </button>
        );
      })}
    </div>
  );
}

function Controls({ view, mySide, send }: { view: BoardGameView; mySide: BoardSide; send: (p: BoardPacket) => void }) {
  const [confirmResign, setConfirmResign] = useState(false);
  useEffect(() => {
    if (!confirmResign) return;
    const t = window.setTimeout(() => setConfirmResign(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmResign]);
  const theirOffer = view.drawOffer === other(mySide);
  return (
    <div className="flex flex-wrap justify-center gap-1.5 sm:flex-col sm:flex-nowrap [&>button]:whitespace-nowrap">
      {view.phase === "playing" && theirOffer && (
        <>
          <button type="button" className="clay-btn clay-btn-mint min-h-9 flex-1 px-2 text-xs sm:flex-none" onClick={() => send({ type: "BOARD_DRAW", accept: true })}>
            🤝 Accept draw
          </button>
          <button type="button" className="clay-btn clay-btn-ghost min-h-9 flex-1 px-2 text-xs sm:flex-none" onClick={() => send({ type: "BOARD_DRAW", accept: false })}>
            Decline
          </button>
        </>
      )}
      {view.phase === "playing" && view.moves > 0 && !theirOffer && (
        <button type="button" className="clay-btn clay-btn-ghost min-h-9 flex-1 px-2 text-xs sm:flex-none" disabled={view.drawOffer === mySide} onClick={() => send({ type: "BOARD_DRAW" })}>
          {view.drawOffer === mySide ? "Draw offered…" : "🤝 Offer draw"}
        </button>
      )}
      {view.phase === "playing" && (
        <button type="button" className={`clay-btn min-h-9 flex-1 px-2 text-xs sm:flex-none ${confirmResign ? "clay-btn-rose" : "clay-btn-ghost"}`} onClick={() => (confirmResign ? (send({ type: "BOARD_RESIGN" }), setConfirmResign(false)) : setConfirmResign(true))}>
          {confirmResign ? "Tap again to resign" : "🏳️ Resign"}
        </button>
      )}
      {(view.phase === "over" || (view.phase === "playing" && view.moves === 0)) && (
        <>
          {view.phase === "over" && (
            <button type="button" className="clay-btn clay-btn-amber min-h-9 flex-1 px-2 text-xs sm:flex-none" onClick={() => send({ type: "BOARD_RESET", gameType: view.gameType })}>
              🔁 Rematch
            </button>
          )}
          <button type="button" className="clay-btn clay-btn-ghost min-h-9 flex-1 px-2 text-xs sm:flex-none" onClick={() => send({ type: "BOARD_RESET", gameType: view.gameType === "chess" ? "checkers" : "chess" })}>
            Switch to {view.gameType === "chess" ? "Checkers" : "Chess"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// the board

function Board({ view, mySide, send }: { view: BoardGameView; mySide: BoardSide | ""; send: (p: BoardPacket) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  const flip = mySide === "b"; // your own side at the bottom
  const myTurn = !!mySide && view.phase === "playing" && view.turn === mySide;
  const legal = useMemo(() => (myTurn ? view.legal : []), [myTurn, view.legal]);

  // a new position clears whatever was picked; a checkers chain keeps its piece picked for you
  useEffect(() => {
    setPromoting(null);
    const froms = new Set(legal.map((m) => m.from));
    setPicked(froms.size === 1 && view.gameType === "checkers" && view.mustJump ? [...froms][0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moves, view.gameType, view.phase, myTurn]);

  const targets = useMemo(() => new Map(legal.filter((m) => m.from === picked).map((m) => [m.to, m])), [legal, picked]);
  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const kingInCheck = view.check ? view.cells.indexOf(`${view.turn}k`) : -1;

  const tap = (i: number) => {
    if (!myTurn) return;
    const target = targets.get(i);
    if (target && picked !== null) {
      if (target.promotion) setPromoting({ from: picked, to: i });
      else send({ type: "BOARD_MOVE", gameType: view.gameType, move: { from: picked, to: i }, fen: view.fen || undefined });
      return;
    }
    setPicked(movable.has(i) ? i : null);
  };

  // square, as big as the middle allows (the container's own units), with room for the frame's edge
  const size = "min(100cqw, calc(100cqh - 14px))";
  return (
    <div className="relative" style={{ width: size, height: size, perspective: "1400px" }}>
      <div className="h-full w-full" style={{ transform: "rotateX(9deg)", transformOrigin: "50% 100%" }}>
        {/* the walnut frame, with its front edge showing below: a board with some thickness */}
        <div className="relative h-full w-full rounded-[18px] p-[3.2%] shadow-[0_14px_0_#3b2314,0_18px_28px_rgba(0,0,0,0.55),inset_0_2px_0_rgba(255,230,190,0.35),inset_0_-3px_0_rgba(0,0,0,0.35)]" style={{ background: "linear-gradient(160deg, #8a5a36 0%, #6b4226 45%, #4e2f1a 100%)" }}>
          {/* eight fixed rows of eight: a piece can never stretch a row, and the field is the container its glyphs are sized in (cqw) */}
          <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[8px] shadow-[inset_0_0_0_2px_rgba(30,15,5,0.55)]" style={{ containerType: "inline-size" }} role="grid" aria-label={`${GAME_NAMES[view.gameType].name} board`}>
            {Array.from({ length: 64 }, (_, d) => {
              const i = flip ? 63 - d : d;
              const row = Math.floor(i / 8);
              const col = i % 8;
              const dark = (row + col) % 2 === 1;
              const cell = view.cells[i];
              const target = targets.get(i);
              // a capture: onto a piece in chess; in checkers every legal move is one while a jump is compulsory
              const capture = !!target && (view.gameType === "chess" ? !!cell : view.mustJump);
              const last = view.lastMove && (view.lastMove.from === i || view.lastMove.to === i);
              const isPicked = picked === i;
              const canPick = movable.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tap(i)}
                  aria-label={`${FILES[col]}${8 - row}${cell ? ` ${cell}` : ""}`}
                  className={`relative flex min-h-0 min-w-0 items-center justify-center ${canPick || target ? "cursor-pointer" : "cursor-default"}`}
                  style={{ background: dark ? "linear-gradient(135deg, #8d5b38, #6f4428)" : "linear-gradient(135deg, #f3dfb8, #e2c696)" }}
                >
                  {last && <span className="absolute inset-0 bg-amber-300/35" />}
                  {/* the king in check: the square glows red round it */}
                  {i === kingInCheck && <span className="absolute inset-0 bg-rose-500/45 shadow-[inset_0_0_0_3px_rgba(255,90,90,0.9),inset_0_0_14px_rgba(255,90,90,0.85)]" />}
                  {isPicked && <span className="absolute inset-0 bg-emerald-300/25 ring-4 ring-inset ring-emerald-300/85" />}
                  {canPick && !isPicked && picked === null && <span className="absolute inset-[38%] rounded-full bg-emerald-200/0 shadow-[0_0_10px_4px_rgba(110,231,183,0.25)]" />}
                  {/* the file and rank letters along the edges, as the bottom player sees the board */}
                  {view.gameType === "chess" && d % 8 === 0 && <span className={`absolute left-0.5 top-0 text-[9px] font-bold leading-none ${dark ? "text-[#f1dcb5]" : "text-[#8d5b38]"}`}>{8 - row}</span>}
                  {view.gameType === "chess" && d >= 56 && <span className={`absolute bottom-0 right-0.5 text-[9px] font-bold leading-none ${dark ? "text-[#f1dcb5]" : "text-[#8d5b38]"}`}>{FILES[col]}</span>}
                  {cell && <Piece cell={cell} gameType={view.gameType} lift={isPicked} />}
                  {target &&
                    (capture ? (
                      // a capture: the piece taken rings red and glows (a checkers jump's landing glows red)
                      cell ? <span className="cozy-capture absolute inset-[5%] rounded-full ring-4 ring-rose-400/90 shadow-[0_0_14px_4px_rgba(251,113,133,0.75)]" /> : <span className="cozy-capture absolute h-[34%] w-[34%] rounded-full bg-rose-400/90 shadow-[0_0_14px_5px_rgba(251,113,133,0.8)]" />
                    ) : (
                      <span className="cozy-move-dot absolute h-[30%] w-[30%] rounded-full bg-emerald-300/90 shadow-[0_0_12px_4px_rgba(110,231,183,0.8)]" />
                    ))}
                </button>
              );
            })}
          </div>
          {promoting && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[18px] bg-black/55">
              <div className="clay-panel flex flex-col items-center gap-2 p-3">
                <div className="text-sm font-semibold">Promote to</div>
                <div className="flex gap-2">
                  {PROMOTIONS.map((p) => (
                    <button key={p} type="button" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 transition-transform duration-150 hover:bg-white/20 active:scale-95" onClick={() => (send({ type: "BOARD_MOVE", gameType: view.gameType, move: { ...promoting, promotion: p }, fen: view.fen || undefined }), setPromoting(null))} aria-label={`Promote to ${p}`}>
                      <ChessPiece cell={`${mySide}${p}`} size={42} />
                    </button>
                  ))}
                </div>
                <button type="button" className="text-xs opacity-70" onClick={() => setPromoting(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .cozy-move-dot { animation: cozy-move-glow 1.3s ease-in-out infinite alternate; }
        .cozy-capture { animation: cozy-capture-glow 0.9s ease-in-out infinite alternate; }
        @keyframes cozy-move-glow { from { transform: scale(0.85); opacity: 0.75; } to { transform: scale(1.05); opacity: 1; } }
        @keyframes cozy-capture-glow { from { opacity: 0.65; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// pieces and badges

/**
 * A carved checkers puck: ivory for the first side, walnut for the second, with a bevel and a groove
 * ring. Always a perfect circle (on the board, 76% of its square: a margin all round so neighbours
 * never touch); a king's crown is sized to the board (cqw), or to `size` off the board.
 */
function Carved({ side, size, children, lift = false }: { side: BoardSide; size?: number; children?: React.ReactNode; lift?: boolean }) {
  const ivory = side === "w";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full transition-transform duration-150 ${lift ? "-translate-y-1 scale-110" : ""}`}
      style={{
        width: size ?? "76%",
        aspectRatio: "1 / 1",
        background: ivory ? "radial-gradient(circle at 35% 28%, #fffdf6 0%, #f5e8cc 45%, #d8bf93 100%)" : "radial-gradient(circle at 35% 28%, #8f5d3c 0%, #5e3820 52%, #321b0d 100%)",
        boxShadow: ivory ? "0 4px 0 #b99a68, 0 6px 10px rgba(40,20,5,0.5), inset 0 -3px 4px rgba(140,100,50,0.35)" : "0 4px 0 #1e0f06, 0 6px 10px rgba(10,5,2,0.6), inset 0 -3px 4px rgba(0,0,0,0.45)",
      }}
    >
      <span className="pointer-events-none absolute inset-[16%] rounded-full" style={{ boxShadow: ivory ? "inset 0 0 0 1.5px rgba(140,100,50,0.35)" : "inset 0 0 0 1.5px rgba(0,0,0,0.35)" }} />
      <span className="pointer-events-none absolute left-[22%] top-[12%] h-[24%] w-[40%] rounded-full bg-white/45 blur-[1px]" />
      {children && (
        <span className="relative leading-none" style={{ fontSize: size ? size * 0.58 : "5.6cqw", color: ivory ? "#4a2e1c" : "#f3e2c0" }}>
          {children}
        </span>
      )}
    </span>
  );
}

// The chess pieces are drawn, not typed: Staunton silhouettes on a 45-unit square, so they never
// depend on a system font (some draw the chess symbols as colour emoji, which no colour can
// carve). Each is a base, a collar and its own head; ivory is filled with a cream gradient and
// edged in walnut, walnut with a dark grain and edged in ivory.
const BASE = <path d="M10.5 40.5h24c1 0 1.5-.6 1.5-1.4v-1.8c0-.9-.6-1.6-1.5-1.6h-24c-.9 0-1.5.7-1.5 1.6v1.8c0 .8.5 1.4 1.5 1.4z" />;
const COLLAR = <path d="M14 36.2c0-1.4 1-2.2 2.2-2.2h12.6c1.2 0 2.2.8 2.2 2.2z" />;
const PIECE_SHAPES: Record<string, React.ReactNode> = {
  p: (
    <>
      <path d="M16 34c.6-4.6 3.2-7.4 3.6-10.8h5.8c.4 3.4 3 6.2 3.6 10.8z" />
      <path d="M17.6 23.4c0-1.2 1-2 2.2-2h5.4c1.2 0 2.2.8 2.2 2z" />
      <circle cx="22.5" cy="15.6" r="5.6" />
    </>
  ),
  r: (
    <>
      <path d="M14.6 34l1.4-13.6h13l1.4 13.6z" />
      <path d="M13 20.6v-8.8h3.8v3.2h3.9v-3.2h3.6v3.2h3.9v-3.2H32v8.8z" />
    </>
  ),
  n: (
    <>
      <path d="M14 34c.4-5 3.6-8.4 6.8-11.6-2.6.2-4.6 1.4-6 2.8-1.6-.4-3-1.8-2.8-3.8.4-3.6 3.4-7.8 7-9.6l.6-3.4 2.6 2.6c5.6.4 9.8 5 9.8 11.4 0 4.8-1.8 7.8-2 11.6z" />
      <circle cx="19.2" cy="15.4" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  b: (
    <>
      <path d="M15.6 34c.8-4.2 3-6.6 3.2-9.6h7.4c.2 3 2.4 5.4 3.2 9.6z" />
      <path d="M17.4 24.6c0-1.2 1-2 2.2-2h5.8c1.2 0 2.2.8 2.2 2z" />
      <path d="M22.5 9c3.8 2.6 6.2 5.6 6.2 8.8 0 2.4-1.4 4-3.4 4.8h-5.6c-2-.8-3.4-2.4-3.4-4.8 0-3.2 2.4-6.2 6.2-8.8z" />
      <path d="M22.5 13.2v5.2M20 15.8h5" fill="none" />
      <circle cx="22.5" cy="6.6" r="2.2" />
    </>
  ),
  q: (
    <>
      <path d="M14.4 34c.8-4.6 2.8-7.8 3.4-11h9.4c.6 3.2 2.6 6.4 3.4 11z" />
      <path d="M12.6 12.6l4.4 10.6h11l4.4-10.6-4.8 5.4-2.2-8-2.9 7.4-2.9-7.4-2.2 8z" />
      <circle cx="12.4" cy="11.4" r="2" />
      <circle cx="19.6" cy="8.6" r="2" />
      <circle cx="25.4" cy="8.6" r="2" />
      <circle cx="32.6" cy="11.4" r="2" />
    </>
  ),
  k: (
    <>
      <path d="M14.4 34c.8-4.6 2.8-7.8 3.4-11h9.4c.6 3.2 2.6 6.4 3.4 11z" />
      <path d="M15.6 23.2c-2.6-2.4-3.2-5.8-1-7.8 2.4-2.2 6-.8 7.9 1.6 1.9-2.4 5.5-3.8 7.9-1.6 2.2 2 1.6 5.4-1 7.8z" />
      <path d="M21.4 13.6V9.4h-3V7.2h3V4.4h2.2v2.8h3v2.2h-3v4.2z" />
    </>
  ),
};

/** The carvings' two woods, defined once for every piece in the panel. */
function CarvingGradients() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="cozy-ivory" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.55" stopColor="#f1e2c2" />
          <stop offset="1" stopColor="#cfb07c" />
        </linearGradient>
        <linearGradient id="cozy-walnut" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#8d5a36" />
          <stop offset="0.5" stopColor="#5a341c" />
          <stop offset="1" stopColor="#2e180a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** A chess piece standing up, carved: ivory edged in walnut, walnut edged in ivory. */
function ChessPiece({ cell, size, lift = false }: { cell: string; size?: number; lift?: boolean }) {
  const ivory = cell[0] === "w";
  return (
    <svg
      viewBox="0 0 45 45"
      className={`relative block shrink-0 transition-transform duration-150 ${lift ? "-translate-y-1 scale-110" : ""}`}
      style={{ width: size ?? "86%", height: size ?? "86%", color: ivory ? "#4a2e1c" : "#f1dcb5", filter: ivory ? "drop-shadow(0 2px 1.5px rgba(60,30,8,0.55))" : "drop-shadow(0 2px 1.5px rgba(0,0,0,0.6))" }}
      aria-hidden
    >
      <g fill={`url(#cozy-${ivory ? "ivory" : "walnut"})`} stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
        {BASE}
        {COLLAR}
        {PIECE_SHAPES[cell[1]]}
      </g>
    </svg>
  );
}

function Piece({ cell, gameType, lift = false }: { cell: string; gameType: BoardGameType; lift?: boolean }) {
  if (gameType === "chess") return <ChessPiece cell={cell} lift={lift} />;
  // checkers: a disc, a king crowned
  return (
    <Carved side={cell[0] as BoardSide} lift={lift}>
      {cell[1] === "k" ? <span className="relative leading-none" style={{ fontSize: "4.6cqw" }}>👑</span> : null}
    </Carved>
  );
}

/** A seated player who is not here right now: their seat is held while they reconnect. */
function Away() {
  return (
    <span className="self-start rounded-full bg-amber-300/20 px-2 py-0.5 text-[11px] font-bold text-amber-100" title="Their seat is held while they reconnect">
      💤 reconnecting…
    </span>
  );
}

function StatusBadge({ view, mySide }: { view: BoardGameView; mySide: BoardSide | "" }) {
  let text: string;
  let tone = "bg-white/10 text-stone-100";
  if (view.phase === "over") {
    const why = view.reason ? ` · ${view.reason}` : "";
    if (view.result === "draw") text = `🤝 Draw${why}`;
    else {
      text = `🏆 ${view.names[view.result as BoardSide] || SIDE_NAMES[view.result as BoardSide]} wins${why}`;
      tone = "bg-amber-300/25 text-amber-100";
    }
  } else if (view.phase === "waiting") {
    text = view.seats.w || view.seats.b ? "Waiting for a second player…" : "Two seats free: sit down to play";
  } else {
    const whose = mySide && view.turn === mySide ? "Your move" : `${SIDE_NAMES[view.turn]} to move`;
    if (view.check) {
      text = `⚠️ Check! ${whose}`;
      tone = "bg-rose-400/25 text-rose-100";
    } else if (view.mustJump) {
      text = `${whose} · must capture!`;
      tone = "bg-emerald-300/20 text-emerald-100";
    } else text = whose;
    if (view.drawOffer) text += ` · ${SIDE_NAMES[view.drawOffer]} offers a draw`;
  }
  return <div className={`rounded-2xl px-3 py-1.5 text-center text-xs font-semibold ${tone}`}>{text}</div>;
}

function Watchers({ view }: { view: BoardGameView }) {
  if (!view.watchers.length) return null;
  return <div className="text-[11px] opacity-60">👀 Watching: {view.watchers.join(", ")}</div>;
}
