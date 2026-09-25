// Little synthesized sound effects for the campfire's games: no files (the Activity's CSP and
// licensing, as for the radio), just a few oscillators and a puff of noise on one shared
// AudioContext, made on first use. Browsers keep it silent until the page has had a tap or a key;
// by the time these play, the player has clicked their way to the fire or the dock.

import { getSoundSettings } from "./soundSettings";

let ctx: AudioContext | null = null;

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
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
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
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(at);
  src.onended = () => (src.disconnect(), filter.disconnect(), g.disconnect());
}

export type Sfx = "bite" | "catch" | "golden" | "burnt" | "star" | "chop" | "thunk" | "pluck" | "squeak" | "quack" | "tension" | "snap" | "flame" | "bubble" | "slurp" | "coins" | "focus";

export function playSfx(kind: Sfx) {
  if (!getSoundSettings().effects) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (kind === "bite") {
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
