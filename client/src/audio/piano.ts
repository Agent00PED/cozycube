import type { PianoPieceId } from "@shared/casino";
import { PIANO_PIECES } from "@shared/pianoPieces";
import { getSoundSettings } from "./soundSettings";
import { sharedAudio } from "./sfx";

// The Velvet Lounge's baby grand, synthesized: each note a warm hammered tone (a triangle with two
// softer overtones through a gentle low-pass, a quick bloom and a long decay that is shorter up the
// keyboard), no samples. A recital (shared/pianoPieces.ts) is scheduled a little ahead of time on
// the shared AudioContext, through one master gain that follows how far the listener stands from
// the piano; a key played by hand sounds at once.

const LOOKAHEAD_S = 0.6;
const TICK_MS = 120;

function strike(c: AudioContext, out: AudioNode, at: number, midi: number, len: number, v: number) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  // higher strings die away sooner; the pedal (len) holds a note no longer than its string rings
  const ring = Math.min(len + 0.35, 3.6 - (midi - 48) * 0.035);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.2 * v), at + 0.008);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.075 * v), at + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.3, ring));
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900 + midi * 38;
  lp.Q.value = 0.4;
  lp.connect(g).connect(out);
  const partials: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.28],
    ["sine", 3, 0.09],
  ];
  const oscs = partials.map(([type, k, amp]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type;
    o.frequency.value = f * k;
    // the faintest detune between the partials, for a string's shimmer
    o.detune.value = (k - 1) * 3;
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(at);
    o.stop(at + Math.max(0.3, ring) + 0.05);
    return { o, og };
  });
  oscs[0].o.onended = () => {
    for (const { o, og } of oscs) (o.disconnect(), og.disconnect());
    lp.disconnect();
    g.disconnect();
  };
}

/** A key pressed (by you, or heard from across the room at `volume`). */
export function playPianoNote(midi: number, volume = 1) {
  if (!getSoundSettings().effects) return;
  const c = sharedAudio();
  if (!c) return;
  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  out.connect(c.destination);
  strike(c, out, c.currentTime + 0.005, midi, 0.9, 0.85);
  window.setTimeout(() => out.disconnect(), 4500);
}

let recital: { timer: number; master: GainNode; stopAt: number } | null = null;

/** Plays `piece` from its start, at a volume `volume()` reads again as it goes (the listener
 *  walks about); a new recital replaces the one playing. */
export function startRecital(piece: PianoPieceId, volume: () => number) {
  stopRecital();
  if (!getSoundSettings().effects) return;
  const c = sharedAudio();
  if (!c) return;
  const events = PIANO_PIECES[piece].events;
  const master = c.createGain();
  master.gain.value = volume();
  master.connect(c.destination);
  const t0 = c.currentTime + 0.15;
  let next = 0;
  const tick = () => {
    master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume())), c.currentTime, 0.15);
    const until = c.currentTime + LOOKAHEAD_S;
    while (next < events.length && t0 + events[next].t < until) {
      const e = events[next++];
      strike(c, master, t0 + e.t, e.midi, e.len, e.v);
    }
    if (next >= events.length && c.currentTime > t0 + PIANO_PIECES[piece].seconds + 1) stopRecital();
  };
  tick();
  recital = { timer: window.setInterval(tick, TICK_MS), master, stopAt: t0 + PIANO_PIECES[piece].seconds };
}

/** Stops the recital: the notes still ringing fade out quickly. */
export function stopRecital() {
  if (!recital) return;
  const { timer, master } = recital;
  recital = null;
  window.clearInterval(timer);
  const c = sharedAudio();
  if (c) master.gain.setTargetAtTime(0, c.currentTime, 0.12);
  window.setTimeout(() => master.disconnect(), 1500);
}

export const recitalPlaying = () => recital !== null;
