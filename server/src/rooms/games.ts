import {
  DAILY_TASKS,
  FISH_TABLES,
  GACHA_COST,
  OUTFITS,
  PREMIUM_HATS,
  hashString,
  type BoardCell,
  type BoardGameView,
  type DailyChecklist,
  type DailyTaskId,
  type FishOnLine,
  type FishingWater,
  type GachaPrize,
  type OutfitId,
  type PremiumHat,
} from "../../../shared/types";

// Pure game logic the room calls into: no Colyseus, no schema, easy to test.

// --- fishing ---------------------------------------------------------------------------------

export function rollFish(water: FishingWater): FishOnLine {
  const table = FISH_TABLES[water];
  const total = table.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of table) {
    roll -= c.weight;
    if (roll <= 0) return { item: c.item, speed: c.speed, size: c.size, water };
  }
  const last = table[table.length - 1];
  return { item: last.item, speed: last.speed, size: last.size, water };
}

// --- gachapon ---------------------------------------------------------------------------------

/** One turn of the crank: hats, the arcade-only jumpsuit, or coins; dupes refund most of the cost. */
export function rollGacha(owned: Set<string>): GachaPrize {
  const roll = Math.random();
  if (roll < 0.05) return owned.has("outfit_cyber") ? { kind: "dupe", refund: 15, id: "outfit_cyber" } : { kind: "outfit", id: "outfit_cyber" as OutfitId };
  if (roll < 0.12) return owned.has("mochiears") ? { kind: "dupe", refund: 15, id: "mochiears" } : { kind: "hat", id: "mochiears" as PremiumHat };
  if (roll < 0.35) {
    const hats = (Object.keys(PREMIUM_HATS) as PremiumHat[]).filter((h) => !PREMIUM_HATS[h].gachaOnly);
    const hat = hats[Math.floor(Math.random() * hats.length)];
    return owned.has(hat) ? { kind: "dupe", refund: Math.min(GACHA_COST - 5, Math.floor(PREMIUM_HATS[hat].price / 8)), id: hat } : { kind: "hat", id: hat };
  }
  if (roll < 0.45) return { kind: "coins", amount: 40 };
  if (roll < 0.75) return { kind: "coins", amount: 10 };
  return { kind: "coins", amount: 5 };
}

export function outfitPrice(id: OutfitId): number {
  return OUTFITS[id].price;
}

// --- the daily checklist ------------------------------------------------------------------------

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Three tasks for the day, the same three for a player however often they reconnect. */
export function rollDaily(userId: string, date = todayKey()): DailyChecklist {
  const ids = Object.keys(DAILY_TASKS) as DailyTaskId[];
  const seed = hashString(`${userId}:${date}`);
  const picked: DailyTaskId[] = [];
  let s = seed;
  while (picked.length < 3) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const id = ids[s % ids.length];
    if (!picked.includes(id)) picked.push(id);
  }
  return { date, tasks: picked.map((id) => ({ id, progress: 0 })), claimed: false };
}

/** Advances a task; returns true when this call completed the whole list. */
export function progressDaily(list: DailyChecklist, id: DailyTaskId, by = 1): boolean {
  const task = list.tasks.find((t) => t.id === id);
  if (!task) return false;
  const goal = DAILY_TASKS[id].goal;
  if (task.progress >= goal) return false;
  task.progress = Math.min(goal, task.progress + by);
  const done = list.tasks.every((t) => t.progress >= DAILY_TASKS[t.id].goal);
  if (done && !list.claimed) {
    list.claimed = true;
    return true;
  }
  return false;
}

// --- checkers ---------------------------------------------------------------------------------
// 8x8, red starts at the top rows (0-2) and moves down (+row); black starts at the bottom and
// moves up. Only dark squares ((row + col) odd) are used. Jumps are compulsory.

export interface BoardGame {
  board: BoardCell[];
  players: { red: string; black: string };
  names: { red: string; black: string };
  turn: "red" | "black";
  winner: "" | "red" | "black";
  /** A piece mid multi-jump must continue from here. */
  chain: number | null;
  lastMoveAt: number;
}

export function newBoardGame(): BoardGame {
  const board: BoardCell[] = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) board[r * 8 + c] = 1;
      else if (r > 4) board[r * 8 + c] = 2;
    }
  }
  return { board, players: { red: "", black: "" }, names: { red: "", black: "" }, turn: "red", winner: "", chain: null, lastMoveAt: Date.now() };
}

const isRed = (cell: BoardCell) => cell === 1 || cell === 3;
const isBlack = (cell: BoardCell) => cell === 2 || cell === 4;
const isKing = (cell: BoardCell) => cell === 3 || cell === 4;
const ownerOf = (cell: BoardCell): "red" | "black" | "" => (isRed(cell) ? "red" : isBlack(cell) ? "black" : "");

interface Move {
  from: number;
  to: number;
  jumped: number | null;
}

function movesFor(board: BoardCell[], index: number): Move[] {
  const cell = board[index];
  const color = ownerOf(cell);
  if (!color) return [];
  const r = Math.floor(index / 8);
  const c = index % 8;
  const dirs = isKing(cell) ? [-1, 1] : color === "red" ? [1] : [-1];
  const steps: Move[] = [];
  const jumps: Move[] = [];
  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const r1 = r + dr;
      const c1 = c + dc;
      if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
      const i1 = r1 * 8 + c1;
      if (board[i1] === 0) steps.push({ from: index, to: i1, jumped: null });
      else if (ownerOf(board[i1]) !== color) {
        const r2 = r1 + dr;
        const c2 = c1 + dc;
        if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
        const i2 = r2 * 8 + c2;
        if (board[i2] === 0) jumps.push({ from: index, to: i2, jumped: i1 });
      }
    }
  }
  return jumps.length ? jumps : steps;
}

/** All legal moves for a colour: any jump available anywhere makes jumping compulsory. */
export function legalMoves(game: BoardGame, color: "red" | "black"): Move[] {
  if (game.chain !== null) return movesFor(game.board, game.chain).filter((m) => m.jumped !== null);
  const all: Move[] = [];
  for (let i = 0; i < 64; i++) if (ownerOf(game.board[i]) === color) all.push(...movesFor(game.board, i));
  const jumps = all.filter((m) => m.jumped !== null);
  return jumps.length ? jumps : all;
}

/** Applies a move for `color`; returns false if it is not legal right now. */
export function applyMove(game: BoardGame, color: "red" | "black", from: number, to: number): boolean {
  if (game.winner || game.turn !== color) return false;
  const move = legalMoves(game, color).find((m) => m.from === from && m.to === to);
  if (!move) return false;
  const piece = game.board[from];
  game.board[from] = 0;
  if (move.jumped !== null) game.board[move.jumped] = 0;
  const row = Math.floor(to / 8);
  const crowned = (color === "red" && row === 7 && piece === 1) || (color === "black" && row === 0 && piece === 2);
  game.board[to] = crowned ? ((piece + 2) as BoardCell) : piece;
  game.lastMoveAt = Date.now();
  // another jump from the landing square keeps the turn (unless the piece was just crowned)
  if (move.jumped !== null && !crowned) {
    const more = movesFor(game.board, to).filter((m) => m.jumped !== null);
    if (more.length) {
      game.chain = to;
      return true;
    }
  }
  game.chain = null;
  game.turn = color === "red" ? "black" : "red";
  if (legalMoves(game, game.turn).length === 0) game.winner = color;
  return true;
}

export function boardView(game: BoardGame): BoardGameView {
  return {
    board: game.board,
    players: game.players,
    names: game.names,
    turn: game.turn,
    winner: game.winner,
    mustJump: legalMoves(game, game.turn).some((m) => m.jumped !== null),
  };
}
