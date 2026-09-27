// The Velvet Lounge's English pub darts board: where a dart lands and what it scores, and the two
// games played on it, solo (the client's own) or a two-player match the room keeps (turns of three
// darts):
//
//   501      from 501 down to exactly 0, finishing on a double (the bullseye counts as one); a dart
//            that takes you below 0, to 1, or to 0 on anything but a double is a bust: the turn's
//            darts don't count and it passes
//   Cricket  the 15s to the 20s and the bull: three marks close a number (a single marks once, a
//            double twice, a treble three times; the outer bull once, the bullseye twice); marks on a
//            number you have closed and your opponent hasn't score its value. Close everything with
//            at least your opponent's points and you win (solo: close everything, in as few darts as
//            you can)
//
// The board's coordinates: x to the right, y up, 1 at the outside of the double ring. The client
// throws (a reticle that sways, and settles now and then: time the click) and reports where the dart
// landed; the server scores it with the same function.
//
// Shared between client and server — framework-agnostic (no THREE/Colyseus imports).

export type DartsGame = "501" | "cricket";
export const DARTS_GAMES: DartsGame[] = ["501", "cricket"];
export const DARTS_GAME_NAME: Record<DartsGame, string> = { "501": "501", cricket: "Cricket" };

/** The numbers round the board, clockwise from the top. */
export const DARTS_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
/** The rings' edges, in board units (a real board's millimetres over 170). */
export const DARTS_RINGS = { bull: 6.35 / 170, outerBull: 15.9 / 170, trebleIn: 99 / 170, trebleOut: 107 / 170, doubleIn: 162 / 170, doubleOut: 1 };
/** How far out a dart may land and still be on the board's surround (a miss), in board units. */
export const DARTS_SURROUND = 1.32;
export const DARTS_PER_TURN = 3;

export interface DartHit {
  x: number;
  y: number;
  /** 1 to 20, 25 the bull, 0 a miss. */
  segment: number;
  mult: 0 | 1 | 2 | 3;
  score: number;
  /** "T20", "D16", "Bull", "25", "Miss". */
  label: string;
}

/** What a dart at (x, y) scores. */
export function dartAt(x: number, y: number): DartHit {
  const r = Math.hypot(x, y);
  const hit = (segment: number, mult: 0 | 1 | 2 | 3, label: string): DartHit => ({ x, y, segment, mult, score: segment === 25 ? (mult === 2 ? 50 : mult === 1 ? 25 : 0) : segment * mult, label });
  if (!Number.isFinite(r) || r > DARTS_RINGS.doubleOut) return hit(0, 0, "Miss");
  if (r <= DARTS_RINGS.bull) return hit(25, 2, "Bull");
  if (r <= DARTS_RINGS.outerBull) return hit(25, 1, "25");
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  const index = Math.floor((((90 - deg + 9) % 360) + 360) % 360 / 18) % 20;
  const n = DARTS_ORDER[index];
  if (r >= DARTS_RINGS.doubleIn) return hit(n, 2, `D${n}`);
  if (r >= DARTS_RINGS.trebleIn && r <= DARTS_RINGS.trebleOut) return hit(n, 3, `T${n}`);
  return hit(n, 1, `${n}`);
}

/** The middle of a number's wedge (or the bull), for aiming and for the house's own throws. */
export function dartsTarget(segment: number, mult: 1 | 2 | 3): { x: number; y: number } {
  if (segment === 25) return { x: 0, y: 0 };
  const index = DARTS_ORDER.indexOf(segment);
  const deg = 90 - index * 18;
  const r = mult === 3 ? (DARTS_RINGS.trebleIn + DARTS_RINGS.trebleOut) / 2 : mult === 2 ? (DARTS_RINGS.doubleIn + DARTS_RINGS.doubleOut) / 2 : 0.4;
  return { x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) };
}

// --- the games --------------------------------------------------------------------------------------

/** Cricket's numbers, in the order the scoreboard lists them. */
export const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25];

export interface DartsPlayer {
  sessionId: string;
  username: string;
  /** 501: what is left to score. */
  remaining: number;
  /** Cricket: the marks on each of CRICKET_TARGETS (0 to 3), and the points scored. */
  marks: number[];
  points: number;
  /** Darts thrown this game. */
  darts: number;
}
export type DartsPhase = "waiting" | "playing" | "over";
export interface DartsMatch {
  phase: DartsPhase;
  game: DartsGame;
  players: DartsPlayer[];
  /** Whose throw (an index into players). */
  turn: number;
  /** This turn's darts so far. */
  thrown: DartHit[];
  /** 501: what was left when this turn began (a bust goes back to it). */
  turnStart: number;
  /** The last turn finished: whose, its darts, and whether it bust. */
  lastTurn: { player: number; hits: DartHit[]; bust: boolean } | null;
  winner: string;
  say: string;
  /** Counts every dart thrown (the clients animate each new one). */
  throwId: number;
}

export function newDartsPlayer(sessionId: string, username: string): DartsPlayer {
  return { sessionId, username, remaining: 501, marks: CRICKET_TARGETS.map(() => 0), points: 0, darts: 0 };
}
export function emptyDartsMatch(game: DartsGame = "501"): DartsMatch {
  return { phase: "waiting", game, players: [], turn: 0, thrown: [], turnStart: 501, lastTurn: null, winner: "", say: "Step up to the oche for a game of darts", throwId: 0 };
}
/** A game begun with these players (one: solo practice), the first to throw first. */
export function startDarts(game: DartsGame, players: { sessionId: string; username: string }[]): DartsMatch {
  return { ...emptyDartsMatch(game), phase: "playing", players: players.map((p) => newDartsPlayer(p.sessionId, p.username)), say: `${players[0].username} to throw` };
}

const closedAll = (p: DartsPlayer) => p.marks.every((m) => m >= 3);

/** The match after one dart. */
export function dartsThrow(m: DartsMatch, hit: DartHit): DartsMatch {
  if (m.phase !== "playing") return m;
  const next: DartsMatch = { ...m, players: m.players.map((p) => ({ ...p, marks: [...p.marks] })), thrown: [...m.thrown, hit], throwId: m.throwId + 1 };
  const me = next.players[next.turn];
  me.darts += 1;
  const passTurn = (bust: boolean, line: string) => {
    next.lastTurn = { player: next.turn, hits: next.thrown, bust };
    next.thrown = [];
    next.turn = (next.turn + 1) % next.players.length;
    next.turnStart = next.players[next.turn].remaining;
    next.say = line || `${next.players[next.turn].username} to throw`;
  };
  const win = (line: string) => {
    next.lastTurn = { player: next.turn, hits: next.thrown, bust: false };
    next.thrown = [];
    next.phase = "over";
    next.winner = me.sessionId;
    next.say = line;
  };
  if (m.game === "501") {
    const left = me.remaining - hit.score;
    const doubled = hit.mult === 2;
    if (left < 0 || left === 1 || (left === 0 && !doubled)) {
      me.remaining = m.turnStart;
      passTurn(true, `Bust! ${me.username} stays on ${m.turnStart}`);
      return next;
    }
    me.remaining = left;
    if (left === 0) {
      win(`${me.username} checks out on ${hit.label}! Game shot!`);
      return next;
    }
  } else {
    const t = CRICKET_TARGETS.indexOf(hit.segment);
    if (t >= 0) {
      const value = hit.segment === 25 ? 25 : hit.segment;
      for (let k = 0; k < hit.mult; k++) {
        if (me.marks[t] < 3) me.marks[t] += 1;
        else if (next.players.some((o) => o !== me && o.marks[t] < 3)) me.points += value;
      }
    }
    const others = next.players.filter((o) => o !== me);
    if (closedAll(me) && others.every((o) => me.points >= o.points)) {
      win(others.length ? `${me.username} closes out the board and wins!` : `All closed in ${me.darts} darts!`);
      return next;
    }
  }
  if (next.thrown.length >= DARTS_PER_TURN) passTurn(false, "");
  return next;
}

/** Cricket's marks as the chalkboard draws them: / X Ⓧ. */
export const cricketMark = (n: number) => (n <= 0 ? "" : n === 1 ? "/" : n === 2 ? "X" : "Ⓧ");
