// Where the server says every player is, kept OUT of React state.
//
// Positions change 16–20 times a second per walking player. Pushed through React state, every one
// of those patches re-rendered the whole app (the HUD, the world, every avatar), and on Discord's
// embedded client that steady main-thread work showed up as micro-stutter. So the room writes
// motion here, and the frame loops read it: the local reconciler (useLocalPlayerMovement) and the
// remote players' interpolation (Players.tsx). React still receives positions, throttled, for the
// few UI checks that want them (proximity to a table, the nearest boxer).

export interface MotionSample {
  /** Arrival time, performance.now() ms. */
  t: number;
  x: number;
  z: number;
}

export interface LiveMotion {
  x: number;
  z: number;
  /** The number of the last movement report the server applied (0: none yet). */
  seq: number;
  /** Bumped whenever x, z or seq changes, so a reader can tell a fresh update from a stale one. */
  version: number;
  /** Recent positions as they arrived, oldest first: the remote players' interpolation buffer. */
  samples: MotionSample[];
}

const MAX_SAMPLES = 24;
/** A report this long after the previous one starts a new walk (see recordMotion). */
const IDLE_GAP_MS = 250;
/** The usual spacing of reports (16 Hz). */
const REPORT_SPACING_MS = 1000 / 16;

export const liveMotion = new Map<string, LiveMotion>();

/** Record the server's latest copy of a player's motion; returns whether anything changed. */
export function recordMotion(sessionId: string, x: number, z: number, seq: number, now = performance.now()): boolean {
  const m = liveMotion.get(sessionId);
  if (!m) {
    liveMotion.set(sessionId, { x, z, seq, version: 1, samples: [{ t: now, x, z }] });
    return true;
  }
  if (m.x === x && m.z === z && m.seq === seq) return false;
  if (m.x !== x || m.z !== z) {
    // after standing still, the player was still where they stood until one report ago: without
    // that sample the first step would stretch over the whole idle time and lurch
    const prev = m.samples[m.samples.length - 1];
    if (prev && now - prev.t > IDLE_GAP_MS) m.samples.push({ t: now - REPORT_SPACING_MS, x: m.x, z: m.z });
    m.samples.push({ t: now, x, z });
    while (m.samples.length > MAX_SAMPLES) m.samples.shift();
  }
  m.x = x;
  m.z = z;
  m.seq = seq;
  m.version++;
  return true;
}
