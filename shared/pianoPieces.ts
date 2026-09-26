import type { PianoPieceId } from "./casino";

// The baby grand's recital book: what it plays when a pianist picks [ Auto-Recital ]. Only
// public-domain pieces (Beethoven's Für Elise, 1810; the opening of Satie's first Gymnopédie, 1888)
// and the house's own tune. The client's synthesized piano plays them (client/src/audio/piano.ts);
// the server needs only how long each runs, so one recital at a time holds the bench.
//
// A piece is written as tracks of tokens, played one after another: a note ("E5", "D#5", "Bb3"), a
// chord ("[F3,A3,C4]"), or a rest ("r"), each lasting one `unit` or ":n" units. "|" marks a bar and
// is only there for reading. Every note rings for at least `pedal` seconds, as if the damper pedal
// were down.

export interface PianoEvent {
  /** Seconds from the start. */
  t: number;
  midi: number;
  /** Seconds it rings. */
  len: number;
  /** 0 to 1. */
  v: number;
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C4" is middle C (MIDI 60). */
export function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

function track(spec: string, unit: number, pedal: number, v: number): PianoEvent[] {
  const out: PianoEvent[] = [];
  let step = 0;
  for (const token of spec.split(/\s+/)) {
    if (!token || token === "|") continue;
    const [what, n] = token.split(":");
    const steps = n ? Number(n) : 1;
    if (what !== "r") {
      const notes = what.startsWith("[") ? what.slice(1, -1).split(",") : [what];
      for (const note of notes) out.push({ t: step * unit, midi: noteMidi(note), len: Math.max(pedal, steps * unit), v });
    }
    step += steps;
  }
  return out;
}

interface PieceSpec {
  title: string;
  by: string;
  unit: number;
  pedal: number;
  right: string;
  left: string;
}

const FUR_ELISE: PieceSpec = {
  title: "Für Elise",
  by: "Ludwig van Beethoven, 1810",
  unit: 0.2,
  pedal: 0.55,
  right:
    "E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:3 C4 E4 A4 | B4:3 E4 G#4 B4 | C5:3 E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:3 C4 E4 A4 | B4:3 E4 C5 B4 | A4:3 B4 C5 D5 | E5:3 G4 F5 E5 | D5:3 F4 E5 D5 | C5:3 E4 D5 C5 | B4:3 E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:3 C4 E4 A4 | B4:3 E4 G#4 B4 | C5:3 E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:3 C4 E4 A4 | B4:3 E4 C5 B4 | A4:6",
  left: "r:2 | r:6 | A2 E3 A3 r:3 | E2 E3 G#3 r:3 | A2 E3 A3 r:3 | r:6 | A2 E3 A3 r:3 | E2 E3 G#3 r:3 | A2 E3 A3 r:3 | C3 G3 C4 r:3 | G2 G3 B3 r:3 | A2 E3 A3 r:3 | E2 E3 E4 r:3 | r:6 | A2 E3 A3 r:3 | E2 E3 G#3 r:3 | A2 E3 A3 r:3 | r:6 | A2 E3 A3 r:3 | E2 E3 G#3 r:3 | [A2,E3,A3]:6",
};

const GYMNOPEDIE: PieceSpec = {
  title: "Gymnopédie No. 1 (opening)",
  by: "Erik Satie, 1888",
  unit: 0.8,
  pedal: 2.0,
  right: "r:12 | r F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4:3 | F#4:12 | r F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4:3 | C#5:3 | F#5:3 | E5:3 | D5:3",
  left: Array.from({ length: 10 }, () => "G2 [B3,D4,F#4]:2 | D2 [A3,C#4,F#4]:2").join(" | "),
};

const DM9 = "D3 r [F3,A3,C4,E4]:2 r:2 [F3,A3,C4,E4]:2";
const G13 = "G2 r [F3,B3,E4]:2 r:2 [F3,B3,E4]:2";
const CMAJ9 = "C3 r [E3,G3,B3,D4]:2 r:2 [E3,G3,B3,D4]:2";
const A7B9 = "A2 r [G3,Bb3,C#4,E4]:2 r:2 [G3,Bb3,C#4,E4]:2";
const VELVET_HOUR: PieceSpec = {
  title: "The Velvet Hour",
  by: "the house pianist (an original)",
  unit: 0.27,
  pedal: 0.6,
  right: [
    "A4:2 C5 E5 F5:2 E5:2 | D5:3 E5 B4:4 | C5:2 E5 G5 B5:4 | A5:2 G5 F5 E5:2 C#5:2",
    "D5:2 F5 A5 C6:3 A5 | G5:2 F5 E5 D5:2 B4:2 | C5:6 r:2 | E5:2 G5:2 Bb5:2 A5:2",
    "A4:2 C5 E5 F5:2 E5:2 | D5:3 E5 B4:4 | C5:2 E5 G5 B5:4 | A5:2 G5 F5 E5:2 C#5:2",
    "D5:2 F5 A5 C6:3 A5 | G5:2 F5 E5 D5:2 B4:2 | C5 E5 G5 B5:5 | r:8",
  ].join(" | "),
  left: [DM9, G13, CMAJ9, A7B9, DM9, G13, CMAJ9, A7B9, DM9, G13, CMAJ9, A7B9, DM9, G13, CMAJ9, "[C3,E3,G3,B3,D4]:8"].join(" | "),
};

const SPECS: Record<PianoPieceId, PieceSpec> = { fur_elise: FUR_ELISE, gymnopedie: GYMNOPEDIE, velvet_hour: VELVET_HOUR };
export const PIANO_PIECE_IDS = Object.keys(SPECS) as PianoPieceId[];

export interface PianoPiece {
  id: PianoPieceId;
  title: string;
  by: string;
  events: PianoEvent[];
  /** From the first note to the last one's ring dying away. */
  seconds: number;
}

export const PIANO_PIECES: Record<PianoPieceId, PianoPiece> = Object.fromEntries(
  PIANO_PIECE_IDS.map((id) => {
    const s = SPECS[id];
    const events = [...track(s.right, s.unit, s.pedal, 0.72), ...track(s.left, s.unit, s.pedal, 0.5)].sort((a, b) => a.t - b.t);
    const seconds = Math.max(...events.map((e) => e.t + Math.min(e.len, 3)));
    return [id, { id, title: s.title, by: s.by, events, seconds }];
  })
) as Record<PianoPieceId, PianoPiece>;

export function isPianoPiece(v: unknown): v is PianoPieceId {
  return typeof v === "string" && (PIANO_PIECE_IDS as string[]).includes(v);
}
