// Reconciling the local player's prediction with the server's validated copy of it.
//
// The client walks on its own prediction and reports it ~16 times a second, each report numbered.
// The server validates a report (speed, bounds, furniture), stores the result as the authoritative
// position and echoes the report's number with it. An echo always describes the PAST: by the time
// it arrives the player has walked on for a round trip. Comparing it with where the player is NOW
// reads the latency itself as an error (at walking speed over Discord's proxy, a unit or more), so
// every echo dragged the player back: the rubberbanding. Instead each echo is compared with what
// was reported under its number. A report the server kept needs no correction, however stale the
// echo; a report it changed (a clamped jump, a spot refused inside furniture) gives the real
// error, which is eased onto the current position, or adopted at once if it is a teleport.

export interface Vec2 {
  x: number;
  z: number;
}

/** An echo this close to its report was accepted as sent. */
export const ACCEPT_EPSILON = 0.01;
/** An error bigger than this is a teleport (a spawn, a map change): adopt it at once. */
export const SNAP_DISTANCE = 1.5;
/** 1/s: how fast a real error is eased away (about 90% of it in a quarter second). */
export const CORRECTION_RATE = 10;
const HISTORY = 64; // reports remembered: four seconds at 16 Hz, far longer than any round trip

interface SentReport {
  seq: number;
  x: number;
  z: number;
  /** The correction applied so far when this report was sent: it already carries that much. */
  cx: number;
  cz: number;
}

export class Reconciler {
  private sent: SentReport[] = [];
  private nextSeq = 1;
  /** The newest report number the server has echoed. */
  private lastEcho = 0;
  /** Everything eased onto the position so far. */
  private applied = { x: 0, z: 0 };
  /** The error still to be eased away. */
  private pending = { x: 0, z: 0 };

  /** Number the report about to be sent from (x, z). */
  report(x: number, z: number): number {
    const seq = this.nextSeq++;
    this.sent.push({ seq, x, z, cx: this.applied.x, cz: this.applied.z });
    if (this.sent.length > HISTORY) this.sent.shift();
    return seq;
  }

  /**
   * The server's copy of us changed: `seq` is the last report it applied, (x, z) where it put us.
   * Returns a jump to add to the position at once (a teleport), or null when any error is left to
   * `step` to ease away.
   */
  onServer(seq: number, x: number, z: number, current: Vec2): Vec2 | null {
    const i = this.sent.findIndex((r) => r.seq === seq);
    // an unknown number older than the last echo is stale; one of our own reports always counts
    // (after a reconnect the server may still hold the previous session's higher number)
    if (i < 0 && seq < this.lastEcho) return null;
    this.lastEcho = seq;
    let need: Vec2;
    if (i >= 0) {
      const r = this.sent[i];
      this.sent.splice(0, i + 1); // older reports can no longer be echoed
      // the report's error, less what has been eased on since it was sent
      need = { x: x - r.x - (this.applied.x - r.cx), z: z - r.z - (this.applied.z - r.cz) };
      if (Math.hypot(x - r.x, z - r.z) < ACCEPT_EPSILON) need = { x: 0, z: 0 };
    } else {
      // the same echo as before but a new position, or no report of ours at all: the server
      // moved us itself (a spawn, a map change)
      need = { x: x - current.x, z: z - current.z };
    }
    if (Math.hypot(need.x, need.z) > SNAP_DISTANCE) {
      this.reset();
      return need;
    }
    this.pending = need;
    return null;
  }

  /** The share of the pending error to add to the position this frame. */
  step(delta: number): Vec2 {
    const k = 1 - Math.exp(-CORRECTION_RATE * delta);
    const move = { x: this.pending.x * k, z: this.pending.z * k };
    this.pending.x -= move.x;
    this.pending.z -= move.z;
    this.applied.x += move.x;
    this.applied.z += move.z;
    return move;
  }

  /** Forget everything in flight: the server just placed us (sat us down, stood us up). */
  reset() {
    this.sent.length = 0;
    this.pending = { x: 0, z: 0 };
    this.lastEcho = 0;
  }
}
