// The coin pushers' shelves, simulated: every coin on a shelf is a disc with a position and a value
// (the stake it was dropped with), and the motorised plate at the back slides in and out for ever.
// A dropped coin rattles down a board of brass pegs (knocked left or right at each row) and lands
// in front of the plate (or, come down an outer lane, runs down a side chute to the house); the
// plate shoves whatever it meets, the coins shove each other, and a coin pushed past the front edge
// falls into the win tray (its value is paid out), unless it goes over hugging the left rail: into
// the house's gutter in that corner. Coins that have stopped moving sleep (skipped until
// something touches them), and a shelf never holds more than PUSHER_MAX_COINS: the server runs this
// at a fixed step for each pusher and sends the shelf to whoever is playing it; the client only
// draws what it is sent.
//
// Units: the shelf is 1 wide (x, 0 at the left) and 1 deep (y, 0 at the back wall, 1 at the edge).
// Only + - * / and sqrt, so any runtime steps it the same.

export const SHELF_W = 1;
export const SHELF_D = 1;
export const COIN_R = 0.05;
/** The plate's face, at its furthest back and its furthest forward, and one full stroke (s). */
export const PLATE_BACK = 0.05;
export const PLATE_FRONT = 0.3;
export const PLATE_PERIOD_S = 2.6;
/** The house's gutter at the front edge's left corner: a coin that goes over the edge with its
 *  centre within this of the left (hugging the rail) drops into it instead of the win tray. */
export const GUTTER_W = 0.056;
export const PUSHER_MAX_COINS = 80;
/** The peg board: rows of pegs a coin falls through, each knocking it this far left or right. */
export const PEG_ROWS = 7;
export const PEG_KNOCK = 0.035;
/** The peg board's outer lanes: a coin that comes down one of them runs down the side chute into
 *  the house's gutter instead of onto the shelf (a wild drop costs you). */
export const PEG_CHUTE = 0.12;
/** Whether a coin that came down the pegs to x lands on the shelf (not down a side chute). */
export const landsOnShelf = (x: number) => x >= PEG_CHUTE && x <= SHELF_W - PEG_CHUTE;
/** The fixed step the shelf is simulated at. */
export const SHELF_STEP_S = 1 / 30;
/** A coin that has moved less than this in a step for SLEEP_S sleeps. */
const REST_EPS = 1e-4;
const SLEEP_S = 0.6;
const RELAX_PASSES = 4;

export interface ShelfCoin {
  id: number;
  x: number;
  y: number;
  /** Its value in chips (the stake it was dropped with). */
  v: number;
  /** Seconds it has lain still (asleep past SLEEP_S). */
  still: number;
}
export interface Shelf {
  coins: ShelfCoin[];
  /** Simulated seconds: the plate's stroke follows it. */
  t: number;
  nextId: number;
}
export interface ShelfFall {
  id: number;
  x: number;
  v: number;
  /** Into the house's gutter (the left corner) rather than the win tray. */
  gutter: boolean;
}

/** Where the plate's face is at simulated time t. */
export function platePos(t: number): number {
  const u = (((t % PLATE_PERIOD_S) + PLATE_PERIOD_S) % PLATE_PERIOD_S) / PLATE_PERIOD_S;
  // a smooth in-and-out (a triangle eased at its ends: no trig, so every runtime agrees)
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  const eased = tri * tri * (3 - 2 * tri);
  return PLATE_BACK + (PLATE_FRONT - PLATE_BACK) * eased;
}

const clampX = (x: number) => Math.max(COIN_R, Math.min(SHELF_W - COIN_R, x));

/** A coin's fall down the peg board from x (0 to 1): where it is after each row, knocked left or
 *  right at random (`rnd` gives 0 to 1); the last is where it lands. */
export function pegPath(x: number, rnd: () => number): number[] {
  const out: number[] = [];
  let at = clampX(x);
  for (let r = 0; r < PEG_ROWS; r++) {
    at = clampX(at + (rnd() < 0.5 ? -PEG_KNOCK : PEG_KNOCK));
    out.push(at);
  }
  return out;
}

export function emptyShelf(): Shelf {
  return { coins: [], t: 0, nextId: 1 };
}

/** A shelf the house has laid out: `n` coins of value `v` in staggered rows from the plate's reach to
 *  the front row hanging over the lip, as a real machine is set up (a new shelf; it is kept from then
 *  on). The rows sit a hair apart, so the first few coins dropped close them up before any go over. */
export function seedShelf(n: number, v: number, rnd: () => number): Shelf {
  const shelf = emptyShelf();
  const dx = COIN_R * 2.1;
  const dy = COIN_R * 1.78;
  for (let row = 0; shelf.coins.length < n; row++) {
    const y = SHELF_D - COIN_R * 0.9 - row * dy;
    if (y < PLATE_FRONT + COIN_R) break;
    for (let x = COIN_R * 1.05 + (row % 2) * (dx / 2); x <= SHELF_W - COIN_R && shelf.coins.length < n; x += dx) {
      const jx = (rnd() - 0.5) * COIN_R * 0.04;
      const jy = (rnd() - 0.5) * COIN_R * 0.04;
      shelf.coins.push({ id: shelf.nextId++, x: clampX(x + jx), y: y + jy, v, still: SLEEP_S });
    }
  }
  return shelf;
}

/** Drops a coin of value `v` that came down the pegs to x: it lands just in front of the plate.
 *  Null if the shelf is full. */
export function landCoin(shelf: Shelf, x: number, v: number): ShelfCoin | null {
  if (shelf.coins.length >= PUSHER_MAX_COINS) return null;
  const coin: ShelfCoin = { id: shelf.nextId++, x: clampX(x), y: platePos(shelf.t) + COIN_R + 0.004, v, still: 0 };
  shelf.coins.push(coin);
  return coin;
}

/** Whether anything on the shelf is moving (a sleeping shelf needs no steps). */
export function shelfAwake(shelf: Shelf): boolean {
  return shelf.coins.some((c) => c.still < SLEEP_S);
}

/** Advances the shelf one fixed step: the plate moves, pushes, the coins part, and what goes over the
 *  edge falls (returned). */
export function stepShelf(shelf: Shelf): ShelfFall[] {
  const before = platePos(shelf.t);
  shelf.t += SHELF_STEP_S;
  const plate = platePos(shelf.t);
  const advancing = plate > before;
  const coins = shelf.coins;
  const n = coins.length;
  const x0 = new Float64Array(n);
  const y0 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x0[i] = coins[i].x;
    y0[i] = coins[i].y;
  }
  const pinned = (c: ShelfCoin) => advancing && c.y - COIN_R <= plate + 1e-6;
  const pushByPlate = () => {
    for (const c of coins) {
      if (c.y - COIN_R < plate) {
        c.y = plate + COIN_R;
        c.still = 0;
      }
    }
  };
  pushByPlate();
  const d2min = COIN_R * COIN_R * 4;
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      const a = coins[i];
      for (let j = i + 1; j < n; j++) {
        const b = coins[j];
        if (a.still >= SLEEP_S && b.still >= SLEEP_S) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 >= d2min) continue;
        if (d2 < 1e-12) {
          // two on the very same spot: part them sideways
          dx = a.id < b.id ? 1e-3 : -1e-3;
          dy = 0;
          d2 = dx * dx;
        }
        const d = Math.sqrt(d2);
        const overlap = COIN_R * 2 - d;
        const nx = dx / d;
        const ny = dy / d;
        let wa = pinned(a) && ny > 0 ? 0 : 1;
        let wb = pinned(b) && ny < 0 ? 0 : 1;
        if (wa + wb === 0) wa = wb = 1;
        const share = overlap / (wa + wb);
        a.x -= nx * share * wa;
        a.y -= ny * share * wa;
        b.x += nx * share * wb;
        b.y += ny * share * wb;
        a.still = 0;
        b.still = 0;
      }
    }
    for (const c of coins) c.x = clampX(c.x);
    pushByPlate();
  }
  // the edge: what is past it falls
  const falls: ShelfFall[] = [];
  const kept: ShelfCoin[] = [];
  for (let i = 0; i < n; i++) {
    const c = coins[i];
    if (c.y > SHELF_D) {
      falls.push({ id: c.id, x: c.x, v: c.v, gutter: c.x < GUTTER_W });
      continue;
    }
    const moved = Math.abs(c.x - x0[i]) + Math.abs(c.y - y0[i]);
    c.still = moved < REST_EPS ? c.still + SHELF_STEP_S : 0;
    kept.push(c);
  }
  shelf.coins = kept;
  return falls;
}

/** The shelf as sent to a player: [id, x, y, value] per coin, x and y in thousandths. */
export function packShelf(shelf: Shelf): number[] {
  const out: number[] = [];
  for (const c of shelf.coins) out.push(c.id, Math.round(c.x * 1000), Math.round(c.y * 1000), c.v);
  return out;
}
export function unpackShelf(packed: number[]): { id: number; x: number; y: number; v: number }[] {
  const out: { id: number; x: number; y: number; v: number }[] = [];
  for (let i = 0; i + 3 < packed.length; i += 4) out.push({ id: packed[i], x: packed[i + 1] / 1000, y: packed[i + 2] / 1000, v: packed[i + 3] });
  return out;
}

/** The shelf as the room saves it (its coins in hundredths: a settled shelf's save never changes). */
export function saveShelf(shelf: Shelf): number[] {
  const out: number[] = [];
  for (const c of shelf.coins) out.push(Math.round(c.x * 100), Math.round(c.y * 100), c.v);
  return out;
}
export function loadShelf(saved: unknown): Shelf | null {
  if (!Array.isArray(saved) || saved.length % 3 !== 0) return null;
  const shelf = emptyShelf();
  for (let i = 0; i < saved.length && shelf.coins.length < PUSHER_MAX_COINS; i += 3) {
    const [x, y, v] = [Number(saved[i]) / 100, Number(saved[i + 1]) / 100, Number(saved[i + 2])];
    if (![x, y, v].every(Number.isFinite) || v <= 0) continue;
    shelf.coins.push({ id: shelf.nextId++, x: clampX(x), y: Math.max(PLATE_FRONT + COIN_R, Math.min(SHELF_D - COIN_R, y)), v: Math.round(v), still: 0 });
  }
  return shelf;
}
