import { Chess, type Square } from "chess.js";
import type { BoardGameType, BoardGameView, BoardMove, BoardSide } from "../../../shared/types";

// The lounge's board game table: two seats, chess or checkers, and whoever is looking on. Pure
// logic (no Colyseus): HangoutRoom feeds it the players' packets and broadcasts view() after every
// change, so the players and every spectator always draw the server's board.
//
// Chess is chess.js. Checkers is the engine below: an 8x8 board played on the dark squares, white
// (seat 1) starting on the bottom three rows and moving up the board, black on the top three
// moving down. Men step one square diagonally forward and capture forward by jumping; a capture
// is compulsory, and a piece that can capture again must go on capturing (a multi-jump chain,
// played one hop per move). A man reaching the far row is crowned a king, which flies: it slides
// any distance along a diagonal, and captures from afar, jumping a single enemy piece on its
// diagonal to land on any empty square beyond it. Being crowned ends the turn. A side with no
// legal move loses; fifty plies of nothing but kings shuffling is a draw.

const FILES = "abcdefgh";
const toSquare = (i: number) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}` as Square;
const toIndex = (sq: string) => (8 - Number(sq[1])) * 8 + FILES.indexOf(sq[0]);
const other = (side: BoardSide): BoardSide => (side === "w" ? "b" : "w");

// --- checkers ------------------------------------------------------------------------------

interface Hop {
  from: number;
  to: number;
  /** The square of the piece this hop captures, or -1 for a plain move. */
  captured: number;
}

interface Checkers {
  cells: string[]; // "" | "wm" | "wk" | "bm" | "bk"
  turn: BoardSide;
  /** A piece in the middle of a multi-jump: it must capture again, from here. */
  chain: number;
  /** Plies since the last capture or man move (kings shuffling): fifty is a draw. */
  quiet: number;
}

const NO_PROGRESS_PLIES = 50;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

function newCheckers(): Checkers {
  const cells: string[] = new Array(64).fill("");
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8);
    if ((r + (i % 8)) % 2 === 0) continue; // only the dark squares are played on
    if (r < 3) cells[i] = "bm";
    else if (r > 4) cells[i] = "wm";
  }
  return { cells, turn: "w", chain: -1, quiet: 0 };
}

/** One piece's plain moves and captures. */
function hopsFrom(cells: string[], i: number): { steps: Hop[]; jumps: Hop[] } {
  const piece = cells[i];
  const steps: Hop[] = [];
  const jumps: Hop[] = [];
  if (!piece) return { steps, jumps };
  const side = piece[0];
  const king = piece[1] === "k";
  const forward = side === "w" ? -1 : 1;
  const r = Math.floor(i / 8);
  const c = i % 8;
  for (const dr of [-1, 1]) {
    for (const dc of [-1, 1]) {
      if (king) {
        // slide along the diagonal to the first piece; if it is an enemy with space behind, it can be taken
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc) && !cells[rr * 8 + cc]) {
          steps.push({ from: i, to: rr * 8 + cc, captured: -1 });
          rr += dr;
          cc += dc;
        }
        if (on(rr, cc) && cells[rr * 8 + cc][0] !== side) {
          const captured = rr * 8 + cc;
          let r2 = rr + dr;
          let c2 = cc + dc;
          while (on(r2, c2) && !cells[r2 * 8 + c2]) {
            jumps.push({ from: i, to: r2 * 8 + c2, captured });
            r2 += dr;
            c2 += dc;
          }
        }
      } else if (dr === forward) {
        const r1 = r + dr;
        const c1 = c + dc;
        if (!on(r1, c1)) continue;
        const next = cells[r1 * 8 + c1];
        if (!next) steps.push({ from: i, to: r1 * 8 + c1, captured: -1 });
        else if (next[0] !== side && on(r1 + dr, c1 + dc) && !cells[(r1 + dr) * 8 + c1 + dc]) jumps.push({ from: i, to: (r1 + dr) * 8 + c1 + dc, captured: r1 * 8 + c1 });
      }
    }
  }
  return { steps, jumps };
}

/** Every legal move for the side to move: captures only when any capture exists anywhere. */
function checkersLegal(g: Checkers): Hop[] {
  if (g.chain >= 0) return hopsFrom(g.cells, g.chain).jumps;
  const steps: Hop[] = [];
  const jumps: Hop[] = [];
  for (let i = 0; i < 64; i++) {
    if (g.cells[i][0] !== g.turn) continue;
    const h = hopsFrom(g.cells, i);
    steps.push(...h.steps);
    jumps.push(...h.jumps);
  }
  return jumps.length ? jumps : steps;
}

/** Plays a hop; returns false if it is not legal now. */
function checkersPlay(g: Checkers, from: number, to: number): boolean {
  const hop = checkersLegal(g).find((h) => h.from === from && h.to === to);
  if (!hop) return false;
  const piece = g.cells[from];
  g.cells[from] = "";
  if (hop.captured >= 0) g.cells[hop.captured] = "";
  const row = Math.floor(to / 8);
  const crowned = piece[1] === "m" && ((piece[0] === "w" && row === 0) || (piece[0] === "b" && row === 7));
  g.cells[to] = crowned ? `${piece[0]}k` : piece;
  g.quiet = hop.captured >= 0 || piece[1] === "m" ? 0 : g.quiet + 1;
  // a capture that can go on capturing keeps the turn, unless it has just been crowned
  if (hop.captured >= 0 && !crowned && hopsFrom(g.cells, to).jumps.length) {
    g.chain = to;
    return true;
  }
  g.chain = -1;
  g.turn = other(g.turn);
  return true;
}

// --- the table ------------------------------------------------------------------------------

// --- saving a table ------------------------------------------------------------------------
//
// A table is saved (the room writes it to the database after every change) so a server restart
// or a redeploy does not wipe a game in progress. Session ids do not survive a restart, so the
// seats are saved as the players' Discord user ids; restored, each is held for its player as
// AWAY_PREFIX + userId, a placeholder every rule already treats as a taken seat, until that player
// rejoins and claims it (or the room gives up waiting and lets it go, forfeiting as walking out does).

export const AWAY_PREFIX = "away:";

export interface BoardSnapshot {
  version: 1;
  gameType: BoardGameType;
  /** The seated players' Discord user ids, "" for an open seat. */
  seats: Record<BoardSide, string>;
  names: Record<BoardSide, string>;
  result: "" | BoardSide | "draw";
  reason: string;
  drawOffer: "" | BoardSide;
  lastMove: { from: number; to: number } | null;
  plies: number;
  settled: boolean;
  /** Chess: the game as PGN (its history counts for threefold repetition), and its FEN as a fallback. */
  pgn: string;
  fen: string;
  checkers: Checkers;
}

const isSide = (v: unknown): v is BoardSide => v === "w" || v === "b";
const isPiece = (v: unknown) => v === "" || v === "wm" || v === "wk" || v === "bm" || v === "bk";

export class BoardTable {
  gameType: BoardGameType = "chess";
  seats: Record<BoardSide, string> = { w: "", b: "" };
  names: Record<BoardSide, string> = { w: "", b: "" };
  /** Everyone with the board open, by session id (their names). */
  readonly watchers = new Map<string, string>();
  private result: "" | BoardSide | "draw" = "";
  private reason = "";
  private drawOffer: "" | BoardSide = "";
  private lastMove: { from: number; to: number } | null = null;
  private plies = 0;
  private chess = new Chess();
  private checkers = newCheckers();
  /** The winner's session id, once a decisive game has been settled (the purse is paid once). */
  private settled = false;

  /**
   * The same player back on a new session (their old connection was lost with its token): their
   * seat and their place among the watchers move with them, and the game carries on.
   */
  transfer(fromId: string, toId: string): boolean {
    let moved = false;
    for (const side of ["w", "b"] as BoardSide[]) {
      if (this.seats[side] !== fromId) continue;
      this.seats[side] = toId;
      moved = true;
    }
    const watching = this.watchers.get(fromId);
    if (watching !== undefined) {
      this.watchers.delete(fromId);
      this.watchers.set(toId, watching);
      moved = true;
    }
    return moved;
  }

  /** The table as it stands, for saving; `userOf` turns a seated session into its user id. */
  snapshot(userOf: (sessionId: string) => string): BoardSnapshot {
    const seat = (side: BoardSide) => {
      const id = this.seats[side];
      return !id ? "" : id.startsWith(AWAY_PREFIX) ? id.slice(AWAY_PREFIX.length) : userOf(id);
    };
    return {
      version: 1,
      gameType: this.gameType,
      seats: { w: seat("w"), b: seat("b") },
      names: { ...this.names },
      result: this.result,
      reason: this.reason,
      drawOffer: this.drawOffer,
      lastMove: this.lastMove,
      plies: this.plies,
      settled: this.settled,
      pgn: this.chess.pgn(),
      fen: this.chess.fen(),
      checkers: { cells: [...this.checkers.cells], turn: this.checkers.turn, chain: this.checkers.chain, quiet: this.checkers.quiet },
    };
  }

  /**
   * Puts a saved table back (after a restart): the game exactly as it was, each seat held for its
   * player until they claim it. Anything malformed leaves the table fresh; returns whether a
   * table came back.
   */
  restore(snap: BoardSnapshot): boolean {
    try {
      if (!snap || snap.version !== 1 || (snap.gameType !== "chess" && snap.gameType !== "checkers")) return false;
      if (!snap.seats?.w && !snap.seats?.b) return false; // nobody was at it: nothing worth keeping
      const chess = new Chess();
      if (snap.gameType === "chess") {
        try {
          chess.loadPgn(snap.pgn);
        } catch {
          chess.load(snap.fen); // throws too if this is no good either
        }
      }
      const c = snap.checkers;
      const checkers = snap.gameType === "checkers" && c && Array.isArray(c.cells) && c.cells.length === 64 && c.cells.every(isPiece) && isSide(c.turn) ? { cells: [...c.cells], turn: c.turn, chain: Number.isInteger(c.chain) ? c.chain : -1, quiet: Number(c.quiet) || 0 } : newCheckers();
      this.gameType = snap.gameType;
      this.chess = chess;
      this.checkers = checkers;
      this.seats = { w: snap.seats.w ? AWAY_PREFIX + snap.seats.w : "", b: snap.seats.b ? AWAY_PREFIX + snap.seats.b : "" };
      this.names = { w: String(snap.names?.w ?? ""), b: String(snap.names?.b ?? "") };
      this.result = snap.result === "draw" || isSide(snap.result) ? snap.result : "";
      this.reason = String(snap.reason ?? "");
      this.drawOffer = isSide(snap.drawOffer) ? snap.drawOffer : "";
      this.lastMove = snap.lastMove && Number.isInteger(snap.lastMove.from) && Number.isInteger(snap.lastMove.to) ? { from: snap.lastMove.from, to: snap.lastMove.to } : null;
      this.plies = Number.isInteger(snap.plies) && snap.plies > 0 ? snap.plies : 0;
      this.settled = !!snap.settled;
      return true;
    } catch {
      this.fresh("chess");
      this.seats = { w: "", b: "" };
      this.names = { w: "", b: "" };
      return false;
    }
  }

  /** The side held for `userId` since a restore, if any. */
  reservedSide(userId: string): BoardSide | "" {
    const held = AWAY_PREFIX + userId;
    return this.seats.w === held ? "w" : this.seats.b === held ? "b" : "";
  }

  /** The player a held seat was waiting for is back: the seat is theirs again, the game goes on. */
  claim(side: BoardSide, sessionId: string) {
    this.seats[side] = sessionId;
  }

  sideOf(sessionId: string): BoardSide | "" {
    return this.seats.w === sessionId ? "w" : this.seats.b === sessionId ? "b" : "";
  }

  /** A game has begun and is not over: its type is locked, seats cannot be swapped, and leaving forfeits it. */
  underWay(): boolean {
    return this.plies > 0 && !this.result;
  }

  private bothSeated(): boolean {
    return !!this.seats.w && !!this.seats.b;
  }

  private turn(): BoardSide {
    return this.gameType === "chess" ? (this.chess.turn() as BoardSide) : this.checkers.turn;
  }

  /** A fresh board of `gameType`; the seats stay. */
  private fresh(gameType: BoardGameType) {
    this.gameType = gameType;
    this.chess = new Chess();
    this.checkers = newCheckers();
    this.result = "";
    this.reason = "";
    this.drawOffer = "";
    this.lastMove = null;
    this.plies = 0;
    this.settled = false;
  }

  private end(result: BoardSide | "draw", reason: string) {
    this.result = result;
    this.reason = reason;
    this.drawOffer = "";
  }

  sit(sessionId: string, name: string, seat: BoardSide): boolean {
    if (this.seats[seat]) return false;
    const mine = this.sideOf(sessionId);
    if (mine) {
      if (this.underWay()) return false; // no swapping sides mid-game
      this.seats[mine] = "";
      this.names[mine] = "";
    }
    // a finished game is cleared away for the new pairing
    if (this.result) this.fresh(this.gameType);
    this.seats[seat] = sessionId;
    this.names[seat] = name;
    this.watchers.delete(sessionId);
    return true;
  }

  /** Gets up from the table; returns true if anything changed. Walking out on an unfinished game with an opponent forfeits it. */
  leave(sessionId: string): boolean {
    const side = this.sideOf(sessionId);
    if (!side) return false;
    if (this.underWay() && this.seats[other(side)]) this.end(other(side), "forfeit");
    this.seats[side] = "";
    this.names[side] = "";
    if (!this.seats.w && !this.seats.b) this.fresh(this.gameType);
    else if (!this.underWay() && !this.result) this.fresh(this.gameType);
    return true;
  }

  select(sessionId: string, gameType: BoardGameType): boolean {
    if (gameType !== "chess" && gameType !== "checkers") return false;
    if (this.underWay() || gameType === this.gameType) return false;
    // a player at the table picks; with nobody seated, anyone looking on may
    if (!this.sideOf(sessionId) && (this.seats.w || this.seats.b)) return false;
    this.fresh(gameType);
    return true;
  }

  reset(sessionId: string, gameType: BoardGameType): boolean {
    if (gameType !== "chess" && gameType !== "checkers") return false;
    if (!this.sideOf(sessionId) || this.underWay()) return false;
    this.fresh(gameType);
    return true;
  }

  move(sessionId: string, gameType: BoardGameType, move: BoardMove): boolean {
    const side = this.sideOf(sessionId);
    if (!side || !this.bothSeated() || this.result || gameType !== this.gameType || side !== this.turn()) return false;
    const { from, to } = move;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return false;
    if (this.gameType === "chess") {
      const promotion = move.promotion && "qrbn".includes(move.promotion) ? move.promotion : "q";
      try {
        this.chess.move({ from: toSquare(from), to: toSquare(to), promotion });
      } catch {
        return false; // chess.js throws on an illegal move
      }
      if (this.chess.isCheckmate()) this.end(side, "checkmate");
      else if (this.chess.isStalemate()) this.end("draw", "stalemate");
      else if (this.chess.isInsufficientMaterial()) this.end("draw", "insufficient material");
      else if (this.chess.isThreefoldRepetition()) this.end("draw", "threefold repetition");
      else if (this.chess.isDrawByFiftyMoves()) this.end("draw", "fifty-move rule");
    } else {
      if (!checkersPlay(this.checkers, from, to)) return false;
      if (checkersLegal(this.checkers).length === 0) this.end(side, "no moves left");
      else if (this.checkers.quiet >= NO_PROGRESS_PLIES) this.end("draw", "no progress");
    }
    this.lastMove = { from, to };
    this.plies++;
    if (this.drawOffer) this.drawOffer = "";
    return true;
  }

  resign(sessionId: string): boolean {
    const side = this.sideOf(sessionId);
    if (!side || !this.bothSeated() || this.result) return false;
    this.end(other(side), "resignation");
    return true;
  }

  /** Offers a draw (accept undefined), or answers the opponent's offer. */
  draw(sessionId: string, accept?: boolean): boolean {
    const side = this.sideOf(sessionId);
    if (!side || !this.bothSeated() || this.result) return false;
    if (this.drawOffer === other(side)) {
      if (accept === false) this.drawOffer = "";
      else this.end("draw", "draw agreed");
      return true;
    }
    if (accept !== undefined || this.drawOffer === side) return false;
    this.drawOffer = side;
    return true;
  }

  watch(sessionId: string, name: string, watching: boolean): boolean {
    if (watching === this.watchers.has(sessionId)) return false;
    if (watching) this.watchers.set(sessionId, name);
    else this.watchers.delete(sessionId);
    return true;
  }

  /** Once per decisive game: the winner's session id, if it lasted long enough to earn the purse. */
  settle(minPlies: number): string {
    if (this.settled || !this.result || this.result === "draw") return "";
    this.settled = true;
    return this.plies >= minPlies ? this.seats[this.result] : "";
  }

  view(): BoardGameView {
    const chess = this.gameType === "chess";
    const turn = this.turn();
    let cells: string[];
    let legal: BoardGameView["legal"] = [];
    if (chess) {
      cells = this.chess.board().flat().map((p) => (p ? `${p.color}${p.type}` : ""));
    } else {
      cells = [...this.checkers.cells];
    }
    if (this.bothSeated() && !this.result) {
      if (chess) {
        const seen = new Set<string>();
        for (const m of this.chess.moves({ verbose: true })) {
          const key = `${m.from}${m.to}`;
          if (seen.has(key)) continue; // one entry per destination, whatever it promotes to
          seen.add(key);
          legal.push({ from: toIndex(m.from), to: toIndex(m.to), promotion: !!m.promotion });
        }
      } else {
        legal = checkersLegal(this.checkers).map((h) => ({ from: h.from, to: h.to, promotion: false }));
      }
    }
    return {
      gameType: this.gameType,
      cells,
      seats: { ...this.seats },
      names: { ...this.names },
      turn,
      phase: this.result ? "over" : this.bothSeated() ? "playing" : "waiting",
      result: this.result,
      reason: this.reason,
      check: chess && this.chess.inCheck(), // a mated king stays lit
      mustJump: !chess && !this.result && checkersLegal(this.checkers).some((h) => h.captured >= 0),
      legal,
      lastMove: this.lastMove,
      drawOffer: this.drawOffer,
      fen: chess ? this.chess.fen() : "",
      moves: this.plies,
      watchers: [...this.watchers.entries()].filter(([id]) => !this.sideOf(id)).map(([, name]) => name),
    };
  }
}

/** For tests: a checkers position, and the engine's legal hops in it. */
export const checkersForTest = { newCheckers, checkersLegal, checkersPlay };
