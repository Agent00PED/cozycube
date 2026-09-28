// The Whispering Pines Slingshot Gallery: a 45-second round of 15 shots at three rails of wooden
// targets gliding across the range (the near rail's tin cans, the middle rail's ducks, the far
// rail's owls) and, now and then, a Golden Acorn skimming the branches above them.
//
// A round is seeded: every target's place at every moment follows from the seed and the clock
// alone, so the client draws the range and the server replays the shots the client reports and
// scores them itself (the same functions, only + - * / and floor: the same numbers everywhere).
// The range is a flat plan: x runs across it (-SPAN..SPAN, a target wraps round off one side and
// back in the other), depth runs away from the shooter (the rails at 0, 1 and 2, the acorn's
// lane at 2.7). A shot is hitscan: aimed at a point (x, depth), it strikes there the instant it is
// loosed (no lead to judge), then a quarter of a second to cock the next acorn.

export const SLING_ROUND_S = 45;
export const SLING_SHOTS = 15;
/** The least time between two shots (the next acorn cocked into the pouch). */
export const SLING_RELOAD_S = 0.25;
/** How far across the range the rails run (a target wraps round at either end). */
export const SLING_SPAN = 1.25;
/** How far away a shot can be aimed (a little past the acorn's lane). */
export const SLING_MAX_DEPTH = 3.1;
/** A shot lands this near a rail's depth or it falls between the rails. */
export const SLING_DEPTH_TOLERANCE = 0.32;
/** The stone's own radius, added to a target's. */
export const SLING_STONE_R = 0.025;
/** A knocked-down target is back up after this long. */
export const SLING_DOWN_S = 1.6;
/** The multiplier tops out here. */
export const SLING_MAX_COMBO = 4;

export type SlingTargetKind = "can" | "duck" | "owl";
export interface SlingRail {
  depth: number;
  points: number;
  radius: number;
  speed: number;
  dir: 1 | -1;
  count: number;
  kind: SlingTargetKind;
}
/** Near to far: easy tin cans (+50), ducks (+150), small quick owls (+200). */
export const SLING_RAILS: readonly SlingRail[] = [
  { depth: 0, points: 50, radius: 0.1, speed: 0.32, dir: 1, count: 3, kind: "can" },
  { depth: 1, points: 150, radius: 0.075, speed: 0.44, dir: -1, count: 3, kind: "duck" },
  { depth: 2, points: 200, radius: 0.06, speed: 0.56, dir: 1, count: 2, kind: "owl" },
];
/** The Golden Acorn: two fly-bys a round, skimming the branches above the far rail. */
export const SLING_ACORN = { depth: 2.7, points: 100, radius: 0.065, speed: 0.96, life: 2.6, flybys: 2 } as const;

export interface SlingShot {
  /** Seconds into the round when it was loosed. */
  t: number;
  /** Where it was aimed: across (-SPAN..SPAN) and away (0..MAX_DEPTH). */
  x: number;
  d: number;
}
export interface SlingHit {
  shot: number;
  /** A rail's index, or -1 for the Golden Acorn. */
  rail: number;
  target: number;
  points: number;
  mult: number;
  /** When and where it struck. */
  at: number;
  x: number;
}
export interface SlingRun {
  score: number;
  hits: SlingHit[];
  acorns: number;
  /** The longest run of hits. */
  streak: number;
}

/** A small seeded generator (mulberry32): the round's starting places and the acorn's times. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SlingRange {
  seed: number;
  /** Each rail's targets' starting places. */
  starts: number[][];
  /** The acorn's fly-bys: when each starts and which way it goes. */
  acorns: { at: number; dir: 1 | -1 }[];
}

export function slingRange(seed: number): SlingRange {
  const r = rng(seed);
  const starts = SLING_RAILS.map((rail) => Array.from({ length: rail.count }, (_, i) => -SLING_SPAN + ((i + 0.2 + r() * 0.6) / rail.count) * 2 * SLING_SPAN));
  const acorns = Array.from({ length: SLING_ACORN.flybys }, (_, k) => ({ at: 6 + r() * 12 + k * 18, dir: (r() < 0.5 ? 1 : -1) as 1 | -1 }));
  return { seed, starts, acorns };
}

function wrap(v: number): number {
  const w = 2 * SLING_SPAN;
  return v + SLING_SPAN - Math.floor((v + SLING_SPAN) / w) * w - SLING_SPAN;
}

/** Where a rail's target is at time t (seconds into the round). */
export function slingTargetX(range: SlingRange, rail: number, i: number, t: number): number {
  const R = SLING_RAILS[rail];
  return wrap(range.starts[rail][i] + R.dir * R.speed * t);
}

/** Where the Golden Acorn of fly-by k is at time t, or null when it isn't in the air. */
export function slingAcornX(range: SlingRange, k: number, t: number): number | null {
  const f = range.acorns[k];
  if (!f || t < f.at || t > f.at + SLING_ACORN.life) return null;
  return f.dir * (-SLING_SPAN + (t - f.at) * SLING_ACORN.speed);
}

/** How long a shot aimed `d` away is in the air: none (hitscan, whatever the distance). */
export function slingFlight(_d: number): number {
  return 0;
}

/** The multiplier a hit earns after `streak` hits in a row: three at x1, three at x2, three at x3,
 *  then x4. */
export function slingMult(streak: number): number {
  return Math.min(SLING_MAX_COMBO, 1 + Math.floor(streak / 3));
}

/** Plays a round's shots against its range: what each one hit, the score, the Golden Acorns. */
export function playSlingshot(seed: number, shots: readonly SlingShot[]): SlingRun {
  const range = slingRange(seed);
  const downUntil = new Map<string, number>();
  const acornHit = new Set<number>();
  const hits: SlingHit[] = [];
  let score = 0;
  let acorns = 0;
  let streak = 0;
  let best = 0;
  shots.forEach((s, n) => {
    const at = s.t + slingFlight(s.d);
    let hit: { rail: number; target: number; x: number; points: number } | null = null;
    // the Golden Acorn first (it flies above the far rail, in its own lane)
    if (Math.abs(s.d - SLING_ACORN.depth) <= SLING_DEPTH_TOLERANCE) {
      for (let k = 0; k < range.acorns.length && !hit; k++) {
        if (acornHit.has(k)) continue;
        const x = slingAcornX(range, k, at);
        if (x !== null && Math.abs(x - s.x) <= SLING_ACORN.radius + SLING_STONE_R) {
          acornHit.add(k);
          hit = { rail: -1, target: k, x, points: SLING_ACORN.points };
        }
      }
    }
    if (!hit) {
      const rail = SLING_RAILS.findIndex((R) => Math.abs(s.d - R.depth) <= SLING_DEPTH_TOLERANCE);
      if (rail >= 0) {
        const R = SLING_RAILS[rail];
        let bestGap = Infinity;
        for (let i = 0; i < R.count; i++) {
          if ((downUntil.get(`${rail}:${i}`) ?? -1) > at) continue;
          const x = slingTargetX(range, rail, i, at);
          const gap = Math.abs(x - s.x);
          if (gap <= R.radius + SLING_STONE_R && gap < bestGap) {
            bestGap = gap;
            hit = { rail, target: i, x, points: R.points };
          }
        }
        if (hit) downUntil.set(`${rail}:${hit.target}`, at + SLING_DOWN_S);
      }
    }
    if (!hit) {
      streak = 0;
      return;
    }
    const mult = slingMult(streak);
    streak += 1;
    best = Math.max(best, streak);
    if (hit.rail < 0) acorns += 1;
    score += hit.points * mult;
    hits.push({ shot: n, rail: hit.rail, target: hit.target, points: hit.points * mult, mult, at, x: hit.x });
  });
  return { score, hits, acorns, streak: best };
}

/** The shots a client reports, checked: at most 15, in order, a reload apart, inside the round
 *  and no later than the round has really run (plus a little slack), each aimed on the range.
 *  Anything else and the round is thrown out (null). */
export function validSlingShots(raw: unknown, elapsedS: number): SlingShot[] | null {
  if (!Array.isArray(raw) || raw.length > SLING_SHOTS) return null;
  const out: SlingShot[] = [];
  let last = -Infinity;
  for (const s of raw) {
    if (!s || typeof s !== "object") return null;
    const { t, x, d } = s as Record<string, unknown>;
    if (typeof t !== "number" || typeof x !== "number" || typeof d !== "number" || !Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(d)) return null;
    if (t < 0 || t > SLING_ROUND_S || t > elapsedS + 2 || t < last + SLING_RELOAD_S - 0.02) return null;
    last = t;
    out.push({ t: Math.round(t * 1000) / 1000, x: Math.max(-SLING_SPAN - 0.1, Math.min(SLING_SPAN + 0.1, x)), d: Math.max(0, Math.min(SLING_MAX_DEPTH, d)) });
  }
  return out;
}

/** The round's prize tier for a score (the best one also brings the Eagle Eye), or null. */
export function slingPrize<T extends { score: number }>(tiers: readonly T[], score: number): T | null {
  return tiers.find((t) => score >= t.score) ?? null;
}
