// Little synthesized sound effects for the campfire's and the casino's games: no files (the
// Activity's CSP and licensing, as for the radio), just a few oscillators and a puff of noise on
// one shared AudioContext, made on first use. Browsers keep it silent until the page has had a tap
// or a key; by the time these play, the player has clicked their way somewhere. A sound from the
// world (the dice, the piano across the lounge) can be played quieter the further away it is.

import { getSoundSettings } from "./soundSettings";

let ctx: AudioContext | null = null;
/** The volume of the sound being made (0..1): what playSfx was asked for. */
let level = 1;

function audio(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx ??= new Ctx();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, at: number, from: number, to: number, length: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + length);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * level), at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + length + 0.02);
  o.onended = () => (o.disconnect(), g.disconnect());
}

function noise(c: AudioContext, at: number, length: number, gain: number, cutoff: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = gain * level;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(at);
  src.onended = () => (src.disconnect(), filter.disconnect(), g.disconnect());
}

export type Sfx =
  | "bite"
  | "catch"
  | "golden"
  | "burnt"
  | "star"
  | "chop"
  | "thunk"
  | "pluck"
  | "squeak"
  | "quack"
  | "tension"
  | "snap"
  | "flame"
  | "bubble"
  | "slurp"
  | "coins"
  | "focus"
  | "chime"
  | "crit"
  | "woodSnap"
  | "masterwork"
  // the casino's
  | "jackpot"
  | "sparkle"
  | "dice"
  | "capsule"
  | "hoot"
  | "clack"
  | "fizz"
  | "rattle"
  | "bugle";

/** A sound from somewhere in the world, heard from where you stand: full up close, fading with
 *  distance (and never quite gone within the room). */
export function distanceVolume(fromX: number, fromZ: number, atX: number, atZ: number, range = 7): number {
  const d = Math.hypot(fromX - atX, fromZ - atZ);
  return Math.max(0.12, 1 / (1 + (d / range) ** 2));
}

export function playSfx(kind: Sfx, volume = 1) {
  if (!getSoundSettings().effects) return;
  const c = audio();
  if (!c) return;
  level = Math.max(0, Math.min(1, volume));
  const t = c.currentTime + 0.01;
  if (kind === "jackpot") {
    // a brass fanfare up the chord, a held top, and a shower of coins
    [523, 659, 784, 1047].forEach((f, i) => {
      tone(c, t + i * 0.1, f, f, 0.22, 0.08, "square");
      tone(c, t + i * 0.1, f * 2, f * 2, 0.2, 0.04, "triangle");
    });
    [784, 1047, 1319].forEach((f) => tone(c, t + 0.42, f, f * 1.005, 0.9, 0.06, "sawtooth"));
    [0.5, 0.58, 0.67, 0.73, 0.82, 0.9, 1.0, 1.08].forEach((d, i) => tone(c, t + d, 1800 + (i % 3) * 300, 2100 + (i % 3) * 300, 0.12, 0.05, "triangle"));
    noise(c, t + 0.45, 0.8, 0.05, 7000);
  } else if (kind === "sparkle") {
    // a tip in the jar: bright little pings running up, a shimmer
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(c, t + i * 0.06, f, f, 0.35, 0.05, "sine"));
    noise(c, t + 0.1, 0.4, 0.03, 8000);
  } else if (kind === "dice") {
    // the dice rattle down the felt and knock the far wall
    [0, 0.06, 0.11, 0.19, 0.24, 0.33, 0.41].forEach((d) => noise(c, t + d, 0.03, 0.2, 2400 + Math.random() * 1200));
    tone(c, t + 0.5, 700, 480, 0.07, 0.12, "triangle");
    tone(c, t + 0.58, 640, 440, 0.06, 0.09, "triangle");
  } else if (kind === "capsule") {
    // the crank's ratchet, a capsule dropping out, and a chime as it pops open
    [0, 0.1, 0.2].forEach((d) => noise(c, t + d, 0.03, 0.25, 3000));
    tone(c, t + 0.38, 300, 900, 0.12, 0.12, "triangle");
    [1047, 1319, 1568].forEach((f, i) => tone(c, t + 0.55 + i * 0.07, f, f, 0.5, 0.06, "sine"));
  } else if (kind === "hoot") {
    // the brass owl: hoo, hoo-hoo, a whirr of clockwork under it
    tone(c, t, 440, 390, 0.35, 0.09, "sine");
    tone(c, t + 0.5, 430, 385, 0.18, 0.08, "sine");
    tone(c, t + 0.72, 430, 380, 0.3, 0.08, "sine");
    noise(c, t, 0.9, 0.02, 1800);
  } else if (kind === "clack") {
    // the break: a crack of balls, then the rolling knocks
    noise(c, t, 0.025, 0.4, 5200);
    tone(c, t, 1900, 1300, 0.06, 0.14, "triangle");
    [0.12, 0.2, 0.31, 0.45].forEach((d, i) => tone(c, t + d, 1600 - i * 120, 1200 - i * 100, 0.05, 0.08 - i * 0.012, "triangle"));
  } else if (kind === "fizz") {
    // bubbles rising in a glass
    for (let i = 0; i < 12; i++) {
      const f = 1800 + Math.random() * 2600;
      tone(c, t + Math.random() * 0.6, f, f * 1.4, 0.05, 0.03, "sine");
    }
    noise(c, t, 0.6, 0.04, 6500);
  } else if (kind === "rattle") {
    // a locked door: the handle tried twice
    [0, 0.22].forEach((d) => {
      noise(c, t + d, 0.1, 0.22, 900);
      tone(c, t + d, 130, 90, 0.12, 0.12, "sine");
    });
  } else if (kind === "bugle") {
    // the call to the post
    const notes: [number, number][] = [
      [523, 0],
      [659, 0.14],
      [784, 0.28],
      [1047, 0.42],
      [784, 0.62],
      [1047, 0.76],
    ];
    notes.forEach(([f, d]) => tone(c, t + d, f, f, 0.16, 0.07, "triangle"));
  } else if (kind === "bite") {
    // the bobber goes under: a plop and a little splash
    tone(c, t, 520, 170, 0.2, 0.18);
    noise(c, t, 0.18, 0.12, 1800);
  } else if (kind === "catch") {
    // out of the water: a bright rising chime
    [660, 880, 1320].forEach((f, i) => tone(c, t + i * 0.08, f, f * 1.01, 0.35, 0.12, "triangle"));
  } else if (kind === "golden") {
    [880, 1175].forEach((f, i) => tone(c, t + i * 0.1, f, f, 0.45, 0.12, "sine"));
  } else if (kind === "star") {
    // a star spark: a cozy little music-box chime, up an arpeggio with a shimmer on top
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(c, t + i * 0.07, f, f, 0.6 - i * 0.08, 0.09, "sine"));
    noise(c, t + 0.2, 0.35, 0.03, 7000);
  } else if (kind === "chop") {
    // a clean split: a crisp crack and a woody knock
    noise(c, t, 0.09, 0.35, 2600);
    tone(c, t, 240, 110, 0.18, 0.2, "triangle");
  } else if (kind === "crit") {
    // a critical chop in the gold: a sharper, brighter crack with a ring on top
    noise(c, t, 0.07, 0.42, 4200);
    tone(c, t, 320, 150, 0.14, 0.22, "triangle");
    tone(c, t + 0.03, 1568, 1568, 0.22, 0.07, "sine");
  } else if (kind === "woodSnap") {
    // a carving breaks: a dull, splintering snap
    noise(c, t, 0.16, 0.3, 900);
    tone(c, t, 180, 60, 0.28, 0.22, "sine");
  } else if (kind === "masterwork") {
    // a Masterwork: a high, rewarding chime, up and sparkling
    [1319, 1760, 2349, 2637].forEach((f, i) => tone(c, t + i * 0.06, f, f, 0.7 - i * 0.1, 0.1, "sine"));
    noise(c, t + 0.18, 0.4, 0.04, 8000);
  } else if (kind === "thunk") {
    // a glancing blow: a dull thud
    tone(c, t, 130, 70, 0.22, 0.2, "sine");
    noise(c, t, 0.06, 0.12, 900);
  } else if (kind === "tension") {
    // the line straining: a taut, rising twang
    tone(c, t, 660, 990, 0.12, 0.06, "triangle");
  } else if (kind === "snap") {
    // the line breaks: a sharp crack and a slack wobble down
    noise(c, t, 0.06, 0.3, 4200);
    tone(c, t + 0.02, 900, 140, 0.35, 0.1, "sawtooth");
  } else if (kind === "squeak") {
    // the raccoon, delighted: two quick high chirps
    tone(c, t, 1500, 2300, 0.09, 0.07, "sine");
    tone(c, t + 0.12, 1700, 2600, 0.1, 0.07, "sine");
  } else if (kind === "quack") {
    // a soft duck quack: a nasal buzz falling in pitch, twice, then a plop as it dives
    tone(c, t, 520, 330, 0.14, 0.07, "sawtooth");
    tone(c, t + 0.17, 480, 300, 0.16, 0.06, "sawtooth");
    tone(c, t + 0.45, 600, 180, 0.18, 0.12, "sine");
    noise(c, t + 0.45, 0.2, 0.08, 1500);
  } else if (kind === "flame") {
    // wood on the fire: a whoosh of air, a crackle, the flames leaping up
    noise(c, t, 0.55, 0.22, 700);
    noise(c, t + 0.05, 0.4, 0.12, 2400);
    [0.12, 0.2, 0.31, 0.43].forEach((d) => noise(c, t + d, 0.03, 0.18, 5200));
    tone(c, t, 90, 180, 0.45, 0.1, "sine");
  } else if (kind === "bubble") {
    // the Dutch oven: three soft blurps
    [0, 0.14, 0.3].forEach((d, i) => tone(c, t + d, 240 + i * 60, 480 + i * 80, 0.09, 0.08, "sine"));
  } else if (kind === "slurp") {
    // a warm bowl of stew: a sip and a happy hum
    noise(c, t, 0.22, 0.06, 1200);
    tone(c, t + 0.25, 392, 523, 0.3, 0.07, "triangle");
  } else if (kind === "coins") {
    // Barnaby counting out coins: a cascade of little clinks
    [0, 0.06, 0.13, 0.19, 0.27].forEach((d, i) => tone(c, t + d, 1800 + (i % 2) * 400, 2100 + (i % 2) * 400, 0.12, 0.05, "triangle"));
  } else if (kind === "chime") {
    // a soft two-note bell: the creel is full, time to rest
    tone(c, t, 784, 784, 0.9, 0.05, "sine");
    tone(c, t + 0.18, 1175, 1175, 1.1, 0.04, "sine");
  } else if (kind === "focus") {
    // a lens clicking into focus: a soft mechanical tick and a small bright chime
    noise(c, t, 0.025, 0.14, 4200);
    tone(c, t + 0.03, 1568, 1568, 0.28, 0.05, "sine");
    tone(c, t + 0.08, 2093, 2093, 0.3, 0.035, "sine");
  } else if (kind === "pluck") {
    // picking: a soft snap and a bright blip
    noise(c, t, 0.05, 0.12, 3500);
    tone(c, t + 0.03, 880, 1320, 0.14, 0.08, "triangle");
  } else {
    // charcoal: a hiss and a low thump
    noise(c, t, 0.4, 0.2, 3200);
    tone(c, t, 160, 70, 0.25, 0.14, "sine");
  }
}

// The baby grand: a short arpeggio up (and back down) a jazzy chord, picked by `seed` so everyone in
// the room hears the same tune, each note a warm piano-ish tone (a sine with a softer overtone and
// a quick bloom, a long decay).
const PIANO_CHORDS = [
  [53, 57, 60, 64, 67, 72], // Fmaj9
  [55, 58, 62, 65, 69, 74], // Gm9
  [48, 52, 55, 58, 62, 67], // C9
  [50, 53, 57, 60, 64, 69], // Dm9
  [46, 50, 53, 57, 60, 65], // Bbmaj7
];

export function playPiano(seed: number, volume = 1) {
  if (!getSoundSettings().effects) return;
  const c = audio();
  if (!c) return;
  level = Math.max(0, Math.min(1, volume));
  const chord = PIANO_CHORDS[Math.abs(seed) % PIANO_CHORDS.length];
  const down = (seed >> 3) % 2 === 1;
  const order = down ? [...chord].reverse() : [...chord, chord[4], chord[3]];
  const t = c.currentTime + 0.02;
  order.forEach((midi, i) => {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const at = t + i * 0.11;
    tone(c, at, f, f, 1.4, 0.06, "sine");
    tone(c, at, f * 2, f * 2, 0.6, 0.018, "triangle");
    tone(c, at, f * 3, f * 3, 0.25, 0.006, "sine");
  });
}
