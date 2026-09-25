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
// whole table after every change; this modal only draws that view and sends packets. Opening it
// registers you as a watcher (BOARD_WATCH), which also fetches the table as it stands.
//
//   the lobby   the game (chess / checkers), the two seats (white moves first) with Sit / Leave,
//               and Spectate once a game is on
//   the board   your own side at the bottom; tap a piece to see where it can go (the legal moves
//               come from the server, as glowing green dots), tap a dot to move. Check, the last
//               move, a promotion picker, offer / accept a draw, resign, and a rematch.
//
// Walking up to the table has already seated you if a seat was free (the server routes a second
// player to the opposite chair); with both seats taken, the board opens for you to watch.
// Closing the modal gets you up from the table, seat and chair together (in the middle of a game,
// only after a second tap: it forfeits).

const GAME_NAMES: Record<BoardGameType, { name: string; icon: string }> = {
  chess: { name: "Chess", icon: "♟️" },
  checkers: { name: "Checkers", icon: "⛀" },
};
const SIDE_NAMES: Record<BoardSide, string> = { w: "White", b: "Black" };
// solid glyphs for both sides (the disc's colour tells them apart), forced to text presentation
const GLYPHS: Record<string, string> = { p: "♟︎", n: "♞︎", b: "♝︎", r: "♜︎", q: "♛︎", k: "♚︎" };
const PROMOTIONS: ("q" | "r" | "b" | "n")[] = ["q", "r", "b", "n"];
const FILES = "abcdefgh";

export function BoardGameModal({ view, localSessionId, send, onClose }: Props) {
  // registered as a watcher for as long as the modal is open (and fetch the table now)
  const sendRef = useRef(send);
  sendRef.current = send;
  // watch the table; again under a new session (a reconnect that came back as a new player), so
  // the board keeps updating instead of freezing on the old session's last view
  useEffect(() => {
    sendRef.current({ type: "BOARD_WATCH", watching: true });
    return () => sendRef.current({ type: "BOARD_WATCH", watching: false });
  }, [localSessionId]);

  const mySide: BoardSide | "" = view ? (view.seats.w === localSessionId ? "w" : view.seats.b === localSessionId ? "b" : "") : "";
  const underWay = !!view && view.moves > 0 && view.phase !== "over";
  const tableFull = !!view && !!view.seats.w && !!view.seats.b;
  const [mode, setMode] = useState<"lobby" | "board">(mySide || tableFull ? "board" : "lobby");
  // taking a seat takes you to the board; arriving at a full table, you watch it
  const firstView = useRef(true);
  useEffect(() => {
    if (mySide) setMode("board");
  }, [mySide]);
  useEffect(() => {
    if (!view || !firstView.current) return;
    firstView.current = false;
    if (tableFull) setMode("board");
  }, [view, tableFull]);

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

  const game = view ? GAME_NAMES[view.gameType] : GAME_NAMES.chess;
  return (
    <Modal title="Board Games" icon="♟️" onClose={close} width={480}>
      {confirmClose && (
        <div className="mb-2 rounded-2xl bg-rose-400/20 px-3 py-2 text-center text-xs font-semibold text-rose-100" role="alert">
          Closing leaves the table and forfeits this game. Close again to leave.
        </div>
      )}
      {!view ? (
        <p className="pb-4 text-center text-sm opacity-70">Setting up the table…</p>
      ) : mode === "lobby" ? (
        <Lobby view={view} mySide={mySide} underWay={underWay} send={send} onBoard={() => setMode("board")} />
      ) : (
        <Board view={view} mySide={mySide} send={send} onLobby={() => setMode("lobby")} key={`${view.gameType}`} />
      )}
      {mode === "lobby" && (
        <p className="pb-1 pt-2 text-center text-[11px] opacity-50">
          {game.icon} {game.name}: {view?.gameType === "checkers" ? "captures are compulsory and chain on; a crowned king flies along the diagonals." : "tap a piece to see its moves."} A win pays 15 coins.
        </p>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// the lobby

function Lobby({ view, mySide, underWay, send, onBoard }: { view: BoardGameView; mySide: BoardSide | ""; underWay: boolean; send: (p: BoardPacket) => void; onBoard: () => void }) {
  const canChoose = !underWay && (!!mySide || (!view.seats.w && !view.seats.b));
  const active = view.phase !== "waiting" || view.moves > 0;
  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* the game */}
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
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 ${on ? "bg-[#fff4e0] text-stone-900 shadow-[0_2px_8px_rgba(0,0,0,0.35)]" : "text-stone-200 hover:bg-white/10"}`}
            >
              <span className="text-lg leading-none">{GAME_NAMES[g].icon}</span>
              {GAME_NAMES[g].name}
            </button>
          );
        })}
      </div>

      {/* the two seats */}
      <div className="grid grid-cols-2 gap-3">
        {(["w", "b"] as BoardSide[]).map((side, i) => {
          const taken = view.seats[side];
          const mine = mySide === side;
          return (
            <div key={side} className={`flex flex-col items-center gap-2 rounded-3xl p-3 text-center outline outline-1 -outline-offset-1 ${mine ? "bg-amber-300/15 outline-amber-300/40" : "bg-white/5 outline-white/10"}`}>
              <Disc side={side} size={40}>
                {view.gameType === "chess" ? GLYPHS.k : null}
              </Disc>
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">
                Seat {i + 1} · {SIDE_NAMES[side]}
              </div>
              <div className="min-h-5 max-w-full break-words text-sm font-semibold">{taken ? view.names[side] : <span className="opacity-50">Open seat</span>}</div>
              {taken && view.away?.[side] && <Away />}
              {mine ? (
                <button type="button" className="clay-btn clay-btn-ghost min-h-10 w-full text-sm" onClick={() => send({ type: "BOARD_LEAVE" })}>
                  Leave
                </button>
              ) : (
                <button type="button" className="clay-btn clay-btn-amber min-h-10 w-full text-sm" disabled={!!taken || (!!mySide && underWay)} onClick={() => send({ type: "BOARD_SIT", seat: side })}>
                  🪑 Sit
                </button>
              )}
            </div>
          );
        })}
      </div>

      <StatusBadge view={view} mySide={mySide} />

      <div className="flex flex-wrap justify-center gap-2">
        {mySide ? (
          <button type="button" className="clay-btn clay-btn-mint min-h-11" onClick={onBoard}>
            ♟️ To the board
          </button>
        ) : active ? (
          <button type="button" className="clay-btn clay-btn-mint min-h-11" onClick={onBoard}>
            👀 Spectate
          </button>
        ) : null}
      </div>
      <Watchers view={view} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// the board

function Board({ view, mySide, send, onLobby }: { view: BoardGameView; mySide: BoardSide | ""; send: (p: BoardPacket) => void; onLobby: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const flip = mySide === "b"; // your own side at the bottom
  const myTurn = !!mySide && view.phase === "playing" && view.turn === mySide;
  const legal = myTurn ? view.legal : [];

  // a new position clears whatever was picked; a checkers chain keeps its piece picked for you
  useEffect(() => {
    setPromoting(null);
    const froms = new Set(legal.map((m) => m.from));
    setPicked(froms.size === 1 && view.gameType === "checkers" && view.mustJump ? [...froms][0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moves, view.gameType, view.phase, myTurn]);
  useEffect(() => {
    if (!confirmResign) return;
    const t = window.setTimeout(() => setConfirmResign(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmResign]);

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

  const opponent: BoardSide = mySide === "b" ? "w" : "b";
  const bottom: BoardSide = mySide || "w";
  const top: BoardSide = mySide ? opponent : "b";

  return (
    <div className="flex flex-col items-center gap-2 pb-1">
      <div className="flex w-full items-center justify-between gap-2">
        <button type="button" className="text-xs font-semibold opacity-70 hover:opacity-100" onClick={onLobby}>
          ← Table
        </button>
        {mySide ? (
          <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20" onClick={() => send({ type: "BOARD_LEAVE" })}>
            Leave seat
          </button>
        ) : (
          <span className="rounded-full bg-sky-300/15 px-2.5 py-1 text-xs font-semibold text-sky-100">👀 Spectating</span>
        )}
      </div>
      <PlayerChip view={view} side={top} />

      {/* the board: square, sized to what the modal (85vh) has left round it, soft rounded wooden frame */}
      <div className="relative w-full" style={{ maxWidth: "min(100%, max(220px, calc(85vh - 300px)), 400px)" }}>
        <div className="rounded-[22px] bg-gradient-to-b from-[#8a5a3b] to-[#5a3a24] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-3px_0_rgba(0,0,0,0.3)]">
          {/* eight fixed rows of eight: a piece can never stretch a row, and the board is the container its glyphs are sized in (cqw) */}
          <div className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[14px]" style={{ containerType: "inline-size" }} role="grid" aria-label={`${GAME_NAMES[view.gameType].name} board`}>
            {Array.from({ length: 64 }, (_, d) => {
              const i = flip ? 63 - d : d;
              const row = Math.floor(i / 8);
              const col = i % 8;
              const dark = (row + col) % 2 === 1;
              const cell = view.cells[i];
              const target = targets.get(i);
              const last = view.lastMove && (view.lastMove.from === i || view.lastMove.to === i);
              const isPicked = picked === i;
              const canPick = movable.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tap(i)}
                  aria-label={`${FILES[col]}${8 - row}${cell ? ` ${cell}` : ""}`}
                  className={`relative flex min-h-0 min-w-0 items-center justify-center ${dark ? "bg-[#9a6848]" : "bg-[#f1dcb5]"} ${canPick || target ? "cursor-pointer" : "cursor-default"}`}
                >
                  {last && <span className="absolute inset-0 bg-amber-300/35" />}
                  {/* the king in check: the square glows red round its disc */}
                  {i === kingInCheck && <span className="absolute inset-0 bg-rose-500/45 shadow-[inset_0_0_0_3px_rgba(255,90,90,0.9),inset_0_0_14px_rgba(255,90,90,0.85)]" />}
                  {isPicked && <span className="absolute inset-0 ring-4 ring-inset ring-emerald-300/80" />}
                  {/* the file and rank letters along the edges, as white sees the board */}
                  {view.gameType === "chess" && d % 8 === 0 && <span className={`absolute left-0.5 top-0 text-[9px] font-bold leading-none ${dark ? "text-[#f1dcb5]" : "text-[#9a6848]"}`}>{8 - row}</span>}
                  {view.gameType === "chess" && d >= 56 && <span className={`absolute bottom-0 right-0.5 text-[9px] font-bold leading-none ${dark ? "text-[#f1dcb5]" : "text-[#9a6848]"}`}>{FILES[col]}</span>}
                  {cell && <Piece cell={cell} gameType={view.gameType} lift={isPicked} />}
                  {target && (cell ? <span className="absolute inset-[6%] rounded-full ring-4 ring-emerald-300/80 shadow-[0_0_12px_rgba(110,231,183,0.9)]" /> : <span className="absolute h-[30%] w-[30%] rounded-full bg-emerald-300/85 shadow-[0_0_10px_3px_rgba(110,231,183,0.75)]" />)}
                </button>
              );
            })}
          </div>
        </div>
        {promoting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-black/55">
            <div className="clay-panel flex flex-col items-center gap-2 p-3">
              <div className="text-sm font-semibold">Promote to</div>
              <div className="flex gap-2">
                {PROMOTIONS.map((p) => (
                  <button key={p} type="button" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 transition-transform duration-150 hover:bg-white/20 active:scale-95" onClick={() => (send({ type: "BOARD_MOVE", gameType: view.gameType, move: { ...promoting, promotion: p }, fen: view.fen || undefined }), setPromoting(null))} aria-label={`Promote to ${p}`}>
                    <Piece cell={`${mySide}${p}`} gameType="chess" size={44} />
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

      <PlayerChip view={view} side={bottom} />
      <StatusBadge view={view} mySide={mySide} />

      {/* the players' controls */}
      {mySide && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {view.phase === "playing" && view.drawOffer === (mySide === "w" ? "b" : "w") && (
            <>
              <button type="button" className="clay-btn clay-btn-mint min-h-9 px-3 text-xs" onClick={() => send({ type: "BOARD_DRAW", accept: true })}>
                🤝 Accept draw
              </button>
              <button type="button" className="clay-btn clay-btn-ghost min-h-9 px-3 text-xs" onClick={() => send({ type: "BOARD_DRAW", accept: false })}>
                Decline
              </button>
            </>
          )}
          {view.phase === "playing" && view.moves > 0 && view.drawOffer !== (mySide === "w" ? "b" : "w") && (
            <button type="button" className="clay-btn clay-btn-ghost min-h-9 px-3 text-xs" disabled={view.drawOffer === mySide} onClick={() => send({ type: "BOARD_DRAW" })}>
              {view.drawOffer === mySide ? "Draw offered…" : "🤝 Offer draw"}
            </button>
          )}
          {view.phase === "playing" && (
            <button type="button" className={`clay-btn min-h-9 px-3 text-xs ${confirmResign ? "clay-btn-rose" : "clay-btn-ghost"}`} onClick={() => (confirmResign ? (send({ type: "BOARD_RESIGN" }), setConfirmResign(false)) : setConfirmResign(true))}>
              {confirmResign ? "Tap again to resign" : "🏳️ Resign"}
            </button>
          )}
          {(view.phase === "over" || (view.phase === "playing" && view.moves === 0)) && (
            <>
              {view.phase === "over" && (
                <button type="button" className="clay-btn clay-btn-amber min-h-9 px-3 text-xs" onClick={() => send({ type: "BOARD_RESET", gameType: view.gameType })}>
                  🔁 Rematch
                </button>
              )}
              <button type="button" className="clay-btn clay-btn-ghost min-h-9 px-3 text-xs" onClick={() => send({ type: "BOARD_RESET", gameType: view.gameType === "chess" ? "checkers" : "chess" })}>
                Switch to {view.gameType === "chess" ? "Checkers" : "Chess"}
              </button>
            </>
          )}
        </div>
      )}
      <Watchers view={view} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// pieces and badges

/**
 * A glossy clay puck: ivory ceramic for white, cocoa wood for black, with a soft bevel and a
 * groove ring. Always a perfect circle (on the board, 74% of its square: a margin all round so
 * neighbours never touch); its glyph is sized to the board (cqw), or to `size` off the board.
 */
function Disc({ side, size, children, lift = false }: { side: BoardSide; size?: number; children?: React.ReactNode; lift?: boolean }) {
  const white = side === "w";
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full transition-transform duration-150 ${lift ? "-translate-y-0.5 scale-110" : ""}`}
      style={{
        width: size ?? "74%",
        aspectRatio: "1 / 1",
        background: white ? "radial-gradient(circle at 35% 30%, #fffaf0 0%, #f3e3c3 45%, #d8bf93 100%)" : "radial-gradient(circle at 35% 30%, #a0714f 0%, #6b4430 50%, #3e2718 100%)",
        boxShadow: white ? "0 3px 6px rgba(60,35,15,0.45), inset 0 -3px 4px rgba(140,100,50,0.35)" : "0 3px 6px rgba(20,10,5,0.55), inset 0 -3px 4px rgba(0,0,0,0.4)",
      }}
    >
      {/* the groove ring and the gloss highlight */}
      <span className="pointer-events-none absolute inset-[16%] rounded-full" style={{ boxShadow: white ? "inset 0 0 0 1.5px rgba(140,100,50,0.3)" : "inset 0 0 0 1.5px rgba(0,0,0,0.3)" }} />
      <span className="pointer-events-none absolute left-[22%] top-[14%] h-[26%] w-[40%] rounded-full bg-white/45 blur-[1px]" />
      {children && (
        <span
          className="relative leading-none"
          style={{
            fontSize: size ? size * 0.58 : "5.6cqw",
            color: white ? "#4a2e1c" : "#f6e7c8",
            textShadow: white ? "0 1px 0 rgba(255,255,255,0.6)" : "0 1px 0 rgba(0,0,0,0.5)",
            fontFamily: "'Segoe UI Symbol', 'Noto Sans Symbols 2', 'DejaVu Sans', sans-serif",
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

function Piece({ cell, gameType, lift = false, size }: { cell: string; gameType: BoardGameType; lift?: boolean; size?: number }) {
  const side = cell[0] as BoardSide;
  const kind = cell[1];
  // one puck for both games: chess carries its piece's glyph, a checkers king a little crown
  if (gameType === "chess") return <Disc side={side} lift={lift} size={size}>{GLYPHS[kind]}</Disc>;
  return (
    <Disc side={side} lift={lift} size={size}>
      {kind === "k" ? <span className="relative leading-none" style={{ fontSize: size ? size * 0.5 : "4.6cqw" }}>👑</span> : null}
    </Disc>
  );
}

/** A seated player who is not here right now: their seat is held while they reconnect. */
function Away() {
  return (
    <span className="shrink-0 rounded-full bg-amber-300/20 px-2 py-0.5 text-[11px] font-bold text-amber-100" title="Their seat is held while they reconnect">
      💤 reconnecting…
    </span>
  );
}

function PlayerChip({ view, side }: { view: BoardGameView; side: BoardSide }) {
  const toMove = view.phase === "playing" && view.turn === side;
  return (
    <div className={`flex w-full max-w-[400px] items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors ${toMove ? "bg-emerald-300/15 outline outline-1 -outline-offset-1 outline-emerald-300/40" : "bg-white/5"}`}>
      <Disc side={side} size={20} />
      <span className="min-w-0 flex-1 truncate font-semibold">{view.names[side] || <span className="opacity-50">Open seat</span>}</span>
      {view.away?.[side] && <Away />}
      <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">{SIDE_NAMES[side]}</span>
      {toMove && <span className="clay-ring-dot" aria-label="to move" />}
    </div>
  );
}

function StatusBadge({ view, mySide }: { view: BoardGameView; mySide: BoardSide | "" }) {
  let text: string;
  let tone = "bg-white/10 text-stone-100";
  if (view.phase === "over") {
    const why = view.reason ? ` · ${view.reason}` : "";
    if (view.result === "draw") text = `🤝 Draw${why}`;
    else {
      text = `🏆 Winner: ${view.names[view.result as BoardSide] || SIDE_NAMES[view.result as BoardSide]}${why}`;
      tone = "bg-amber-300/25 text-amber-100";
    }
  } else if (view.phase === "waiting") {
    text = view.seats.w || view.seats.b ? "Waiting for a second player…" : "Two seats free: sit down to play";
  } else {
    const whose = mySide && view.turn === mySide ? "Your turn" : `${SIDE_NAMES[view.turn]}'s turn`;
    if (view.check) {
      text = `⚠️ Check! ${whose}`;
      tone = "bg-rose-400/25 text-rose-100";
    } else if (view.mustJump) {
      text = `${whose} · must capture!`;
      tone = "bg-emerald-300/20 text-emerald-100";
    } else text = whose;
    if (view.drawOffer) text += ` · ${SIDE_NAMES[view.drawOffer]} offers a draw`;
  }
  return <div className={`rounded-full px-4 py-1.5 text-center text-sm font-semibold ${tone}`}>{text}</div>;
}

function Watchers({ view }: { view: BoardGameView }) {
  if (!view.watchers.length) return null;
  return <div className="text-center text-xs opacity-60">👀 Watching: {view.watchers.join(", ")}</div>;
}
