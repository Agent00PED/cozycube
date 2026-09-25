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
