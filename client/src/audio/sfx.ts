// Little synthesized sound effects for the campfire's games: no files (the Activity's CSP and
// licensing, as for the radio), just a few oscillators and a puff of noise on one shared
// AudioContext, made on first use. Browsers keep it silent until the page has had a tap or a key;
// by the time these play, the player has clicked their way to the fire or the dock.

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

export type Sfx = "bite" | "catch" | "golden" | "burnt";

export function playSfx(kind: Sfx) {
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
  } else {
    // charcoal: a hiss and a low thump
    noise(c, t, 0.4, 0.2, 3200);
    tone(c, t, 160, 70, 0.25, 0.14, "sine");
  }
}
